# Discourse Chat Channel Categories

`discourse-chat-channel-categories` adds category context and category filtering to the Discourse chat channel browser. It decorates channel browser cards with a compact category label and makes the category dropdown filter the native chat channel API request.

## Behavior

- Adds a compact category label to category-backed chat channel cards in `/chat/browse`.
- Shows parent category context for subcategories, for example `Edge Esmeralda 2025 / Housing`.
- Adds a category dropdown backed by a small category metadata endpoint so options do not depend on scroll position.
- Filters channels server-side through Discourse's native `/chat/api/channels` category parameters.
- Moves the member count and channel action into the channel title row to reduce vertical card height.
- Uses existing chat channel and site category data; no extra channel payload fields are added.
- Updates as the browser paginates, filters, or rerenders cards.
- Patches the existing chat browser collection path while preserving Discourse's routes, tabs, card component, membership buttons, and infinite loader.

## Install

Add the plugin to a Discourse container like any other plugin and rebuild:

```ruby
git clone https://github.com/Oshyan/discourse-chat-channel-categories.git
```
