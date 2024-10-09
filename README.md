# SillyTavern Extension Lua Lorebooks

Program LB entry activations with custom per-LB Lua code

## Features

See usage.

## Non-features

- lorebook PNG embeddings do not work (I'm working on it)
- you can't dynamically store and reuse metadata through the chat (also
working on it, should be an absolute pain in the ass)
- you can't read the preset with Lua (should be simple enough to implement)
- I'm not sure how to handle lua lib imports rn and might not come up with anything good
- you can't dynamically rewrite entries (ST's current APIs go out of their
way to not let me do that. Expecting Cohee to eventually change this)
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
  e = {}
  e["entries"] = {}
  e["entries"]["example_entry_name"] = {}
  return e
end
```

where the return value is a Lua Table, the `entries` field of the response is a table,
and the keys of this `entries` field are the **automation ids** of the entries to be activated
(entries not listed here can still be activated normally depending on the LB configuration).

If Cohee ever improves the API the idea is values of the `entries` table overriding
the LB entry fields they set, so you can dynamically edit things.

`data` is a Lua table with, currently, fields `context`, `chat` and `loreBook` straight
from ST. The JS object gets debug printed on the console for your inspection and it would
take me a millenia to document all the fields. See the examples below for some extra help.

Also note that some associative arrays end up with string keys in the Lua code. So it's
`data["chat"]["0"]["mes"]` to load the greeting.

### Examples

Here is some Lua code that just activates a single entry with **automation id** "eldoria":

```lua
function entries(data)
  e = {}
  e["entries"] = {}
  e["entries"]["eldoria"] = {}
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

  local e = {}
  e["entries"] = {}
  e["entries"][word_to_greeting[first_word]] = {}
  return e
end
```

## Prerequisites

*Specify the version of ST necessary here.*

(No idea lmao.)
