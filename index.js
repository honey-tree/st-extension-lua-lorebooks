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
Bootleg nonsense I have to do because the LB entries are checked on the other side with a JSON.stringify equality
check

Basically we just replace the entries with "canonical" versions
*/

class EntryReplacementService {
    sortedEntries = new Map();

    async init() {
        return getSortedEntries().then(se => se.forEach(el => {
            this.sortedEntries.set(`${el.world}.${el.uid}`, el);
        }));
    }

    replace(entries, world) {
        return entries.map(entry => this.sortedEntries.get(`${world}.${entry.uid}`));
    }
}

/*
Actual extension code that does the thing
 */
async function enableLuaEntries() {
    const context = getContext();

    const loreBooks = await getLoreBooks();

    const erService = new EntryReplacementService();
    await erService.init();

    for (const [loreBookName, loreBook] of loreBooks) {
        if (!loreBook.extensions?.luaCode) {
            continue;
        }

        try {
            const luaFactory = new LuaFactory();
            const lua = await luaFactory.createEngine();

            console.debug(`[LLB]___EXECUTING ${loreBookName}'s LUA CODE___`)
            await lua.doString(loreBook.extensions.luaCode);
            console.debug(`[LLB]___DONE EXECUTING ${loreBookName}'s LUA CODE___`)

            const data = {chat: context.chat, loreBook: loreBook.entries, context: context};
            console.debug("The data object that will be fed into the Lua code:", data);

            console.debug(`[LLB]___INVOKING ${loreBookName}'s LUA FUNCTION TO DETERMINE LB ENTRIES___`);
            const entriesFunction = lua.global.get('entries');
            const luaResp = entriesFunction(data);
            console.debug(`[LLB]___DONE INVOKING ${loreBookName}'s LUA FUNCTION TO DETERMINE LB ENTRIES___`);

            const activatedEntries = Object.entries(loreBook.entries).map(function([id, entry]) {
                return luaResp.entries[entry.automationId] ? entry : null;
            }).filter(entry => entry);

            await eventSource.emit(event_types.WORLDINFO_FORCE_ACTIVATE, erService.replace(activatedEntries, loreBookName));
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

        jQuery("#luaTextarea").val(loreBook?.extensions?.luaCode || '');
    });

    jQuery("#luaTextarea").on('change', async function () {
        const luaCode = jQuery("#luaTextarea").val();

        const selectedIndex = String($('#world_editor_select').find(':selected').text());
        if (!selectedIndex) return;

        const loreBook = await loadWorldInfo(selectedIndex);

        loreBook.extensions ??= {};
        loreBook.extensions.luaCode = luaCode;

        await saveWorldInfo(selectedIndex, loreBook)
    })
});
