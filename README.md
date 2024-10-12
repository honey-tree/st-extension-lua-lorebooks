# SillyTavern Extension Lua Lorebooks

Program LB entry activations with custom per-LB Lua code

## Features

See usage.

## Non-features

- ~~lorebook PNG embeddings do not work~~ lorebook PNG embeddings fine
according to the v2 spec and seem to work on ST. Not 100 they work through
chub, but that'd be an issue with chub not adhering to the v2 spec, which vetoes
discarding unknown lorebook entry extensions fields.
- you can't dynamically store and reuse metadata through the chat (also
working on it, should be an absolute pain in the ass)
- you can't read the preset with Lua (should be simple enough to implement)
- I'm not sure how to handle lua lib imports rn and might not come up with anything good
- ~~you can't dynamically rewrite entries (ST's current APIs go out of their
way to not let me do that. Expecting Cohee to eventually change this)~~ you CAN dynamically
edit entries now, see usage for an example
- you can't dynamically disable entries (ST API issue)
- there's no syntax highlighting (hljs apparently doesn't allow for it)

## Installation and Usage

### Installation

The usual. Copy and paste the link into the extensions manager.

### Usage

At the bottom of the Lorebook entries you'll find a textarea just labelled Lua.

In that textarea, implement an `entries` function in Lua like

```lua
function entries(data)
  local e = {entries={}}
  e["entries"]["example_entry_name"] = {}
  return e
end
```

where the return value is a Lua Table, the `entries` field of the response is a table,
and the keys of this `entries` field are the **automation ids** of the entries to be activated
(entries not listed here can still be activated normally depending on the LB configuration).

Any fields given to the entry object will override the field on the LB (which lets you
rewrite and reposition entries, but does **NOT** let you change keys dynamically), like this

```lua
function entries(data)
  local e = {entries={}}
  e["entries"]["example_entry_name"] = {content="New entry content"}
  return e
end
```

`data` is a Lua userdata with, currently, fields `context`, `chat` and `loreBook` straight
from ST. I emphasize: it's a userdata and not a Lua table. You can directly invoke some JS
fields like `data["chat"].length` and they just work, but Lua table functions like `pairs`
don't.

Blame [wasmoon](https://github.com/ceifa/wasmoon).

Also note that some associative arrays end up with string keys in the Lua code. So it's
`data["chat"]["0"]["mes"]` to load the greeting.

### Examples

Here is some Lua code that just activates a single entry with **automation id** "eldoria" and rewrites its contents:

```lua
function entries(data)
  local e = {entries={}}
  e["entries"]["eldoria"] = {content="Eldoria is gone. Mere fiction at this point."}
  return e
end
```

Here is some Lua code that reads the chat's greeting's first word and uses it to
dynamically enable a relevant greeting-specific entry:

```lua
function entries(data)
  local word_to_greeting = {}
  word_to_greeting["You"] = "shadowfang"
  word_to_greeting["The"] = "glade"

  local greeting = data["chat"]["0"]["mes"]
  local first_word = greeting:match("^(%S+)")

  local e = {entries={}}
  e["entries"][word_to_greeting[first_word]] = {}
  return e
end
```

Here's some Lua code for inspecting the last LLM response and activating an entry that
tells it to write less:

```lua
function entries(data)
  local e = {entries={}}

  local last_llm_message = data["chat"][tostring(data["chat"].length - 3)].mes
  local _, word_count = last_llm_message:gsub("%a[%p%s]", "")

  if word_count > 200 then
    e["entries"]["write_less"] = {}
  end

  return e
end
```

## Prerequisites

[This commit](https://github.com/SillyTavern/SillyTavern/commit/838dfaab8081bb1c9a6c2e457bfba4f50708032a)
needs to be merged into your ST.

Times the required commit has been upped: 1
