# Discourse Chat Channel Categories

`discourse-chat-channel-categories` adds category context to the existing Discourse chat channel browser. It decorates channel browser cards with a compact category label using category data already present in Discourse chat and site category data.

## Behavior

- Adds a compact category label to category-backed chat channel cards in `/chat/browse`.
- Shows parent category context for subcategories, for example `Edge Esmeralda 2025 / Housing`.
- Adds a category dropdown backed by a lightweight chat-channel index request so options do not depend on scroll position.
- Uses Discourse's native infinite loader on demand when a selected category has not rendered yet.
- Moves the member count and channel action into the channel title row to reduce vertical card height.
- Uses existing chat channel and site category data; no server payload fields are added.
- Updates as the browser paginates, filters, or rerenders cards.
- Does not replace chat routes/templates.

## Install

Add the plugin to a Discourse container like any other plugin and rebuild:

```ruby
git clone https://github.com/Oshyan/discourse-chat-channel-categories.git
```
