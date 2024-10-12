import { getContext } from '/scripts/extensions.js';
import { characters, chat_metadata, event_types, eventSource, this_chid } from '/script.js';
import { saveWorldInfo, getSortedEntries, loadWorldInfo, METADATA_KEY, selected_world_info } from '/scripts/world-info.js';
import { LuaFactory } from 'https://cdn.jsdelivr.net/npm/wasmoon/+esm';

const extensionName = "st-extension-lua-lorebooks";

/*
Quick convenience function for genning HTML
 */

function h(type, atts, content) {
    const el = document.createElement(type);
    for (const [k, v] of Object.entries(atts)) {
        el.setAttribute(k, v);
    }

    for (const c of content) {
        if (typeof c === "string") {
            const n = document.createTextNode(c);
            el.appendChild(n);
        } else if (c instanceof Node) {
            el.appendChild(c);
        } else {
            throw "Unsupported content";
        }
    }

    return el;
}

/*
Starting off with things that should already be in world-info.js
 */

function getLoreBookNames() {
    const loreBookNames = new Set();

    //char lorebook
    const character = characters[this_chid];
    if (character?.data?.extensions?.world) {
        loreBookNames.add(character?.data?.extensions?.world);
    }

    //global lorebook
    if (selected_world_info.length) {
        loreBookNames.add(...selected_world_info);
    }

    //chat lorebook
    if (chat_metadata[METADATA_KEY]) {
        loreBookNames.add(chat_metadata[METADATA_KEY]);
    }

    return Array.from(loreBookNames);
}

async function getLoreBooks() {
    return (await Promise.all(
        getLoreBookNames().map(loreBookName => loadWorldInfo(loreBookName).then(worldInfo => [ loreBookName, worldInfo ]))
    )).reduce((acc, el) => {
        acc.set(el[0], el[1]);
        return acc;
    }, new Map());
}

/*
Actual extension code that does the thing
 */

/*
The luaLoreBook state is kept both at the top-level, for preservation
even if lb entries are deleted, and at the entry level, for imports
and exports.

Because top-level lorebook extensions are bootleg stuff I'm forcing
and not part of the spec.
 */

function extractTopLevelLuaLoreBook(loreBook) {
    return loreBook?.extensions?.luaLoreBook;
}

function extractEntryLevelLuaLoreBook(loreBook) {
    for (const [_, entry] of Object.entries(loreBook.entries)) {
        if (entry?.extensions?.luaLoreBook) {
            return entry.extensions.luaLoreBook
        }
    }

    return undefined;
}

function extractLuaLoreBook(loreBook) {
    return extractTopLevelLuaLoreBook(loreBook) || extractEntryLevelLuaLoreBook(loreBook);
}

function insertLuaLoreBook(loreBook, luaLoreBook) {
    loreBook.extensions ||= {};
    loreBook.extensions.luaLoreBook = luaLoreBook;

    for (const [_, entry] of Object.entries(loreBook.entries)) {
        if (entry.extensions) {
            delete (entry.extensions["luaLoreBook"]);
        }
    }

    const [key, entry] = Object.entries(loreBook.entries)[0];
    entry.extensions = entry.extensions || {};
    entry.extensions.luaLoreBook = luaLoreBook;
}

async function ensureBothLuaLoreBooks(loreBookName, loreBook) {
    const topLevelLuaLoreBook = extractTopLevelLuaLoreBook(loreBook);
    const entryLevelLuaLoreBook = extractEntryLevelLuaLoreBook(loreBook);

    if (JSON.stringify(topLevelLuaLoreBook) !== JSON.stringify(entryLevelLuaLoreBook)) {
        const luaLoreBook = topLevelLuaLoreBook || entryLevelLuaLoreBook;
        insertLuaLoreBook(loreBook, luaLoreBook);
        await saveWorldInfo(loreBookName, loreBook);
    }
}

async function enableLuaEntries() {
    const context = getContext();

    const loreBooks = await getLoreBooks();

    for (const [loreBookName, loreBook] of loreBooks) {
        if (!loreBook.extensions?.luaCode) {
            continue;
        }

        try {
            const luaFactory = new LuaFactory();
            const lua = await luaFactory.createEngine();

            const luaLoreBook = extractLuaLoreBook(loreBook);
            if (!luaLoreBook) {
                continue;
            }

            console.debug(`[LLB]___EXECUTING ${loreBookName}'s LUA CODE___`)
            await lua.doString(luaLoreBook.luaCode);
            console.debug(`[LLB]___DONE EXECUTING ${loreBookName}'s LUA CODE___`)

            const data = JSON.parse(JSON.stringify({
                chat: context.chat,
                loreBook: loreBook.entries,
                context: context}
            ));

            console.debug("The data object that will be fed into the Lua code:", data);

            console.debug(`[LLB]___INVOKING ${loreBookName}'s LUA FUNCTION TO DETERMINE LB ENTRIES___`);
            const entriesFunction = lua.global.get('entries');
            const luaResp = entriesFunction(data);
            console.debug(`[LLB]___DONE INVOKING ${loreBookName}'s LUA FUNCTION TO DETERMINE LB ENTRIES___`);

            console.debug("[LLB] Complete Lua output:", luaResp);

            const activatedEntries = Object.entries(loreBook.entries).map(function([id, entry]) {
                const luaEntry = luaResp.entries[entry.automationId];
                if (!luaEntry) {
                    return null;
                }

                entry.world = loreBookName;

                for (const [keyOver, valOver] of Object.entries(luaEntry)) {
                    entry[keyOver] = valOver;
                }

                return entry;
            }).filter(entry => entry);

            console.debug("[LLB] Activated entries:", activatedEntries);

            await eventSource.emit(event_types.WORLDINFO_FORCE_ACTIVATE, activatedEntries);
        } catch (err) {
            console.error("[LLB] Error:", err);
        }
    }
}

// This function is called when the extension is loaded
jQuery(async () => {
    console.log("[LLB] LuaLBs extension loaded");

    /*
    Registering extension events
     */
    eventSource.on(event_types.MESSAGE_SENT, enableLuaEntries);
    eventSource.on(event_types.MESSAGE_SWIPED, enableLuaEntries);
    eventSource.on(event_types.WORLDINFO_UPDATED, ensureBothLuaLoreBooks);

    /*
    Rendering some HTML
     */
    jQuery("#world_popup").append(h("div", {}, [
        h("label", {}, [
            h("small", {for: "luaTextarea"}, ["Lua"]),
        ]), h("textarea", {id: "luaTextarea"}, [""]),
    ]));

    /*
    Registering HTML events
     */
    jQuery("#world_editor_select").on('change', async function () {
        const selectedIndex = String($('#world_editor_select').find(':selected').text());
        if (!selectedIndex) return;

        const loreBook = await loadWorldInfo(selectedIndex);

        const luaLoreBook = extractLuaLoreBook(loreBook);

        jQuery("#luaTextarea").val(luaLoreBook?.luaCode || '');
    });

    jQuery("#luaTextarea").on('change', async function () {
        const luaCode = jQuery("#luaTextarea").val();

        const selectedIndex = String($('#world_editor_select').find(':selected').text());
        if (!selectedIndex) return;

        const loreBook = await loadWorldInfo(selectedIndex);

        insertLuaLoreBook(loreBook, {luaCode: luaCode});

        await saveWorldInfo(selectedIndex, loreBook)
    })
});
