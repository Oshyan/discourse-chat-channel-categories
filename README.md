# Discourse Chat Channel Categories

`discourse-chat-channel-categories` adds category context to the existing Discourse chat channel browser. It decorates channel browser cards with a compact category chip using category data already present in the chat channel API payload.

## Behavior

- Adds a category chip to category-backed chat channel cards in `/chat/browse`.
- Uses the existing `chatable.name`, `chatable.color`, and category URL data from the chat channel model.
- Updates as the browser paginates, filters, or rerenders cards.
- Does not add server payload fields or replace chat routes/templates.

## Install

Add the plugin to a Discourse container like any other plugin and rebuild:

```ruby
git clone https://github.com/Oshyan/discourse-chat-channel-categories.git
```
