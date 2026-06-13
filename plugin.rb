# frozen_string_literal: true

# name: discourse-chat-channel-categories
# about: Shows category context on Discourse chat channel browser cards
# version: 0.5.0
# authors: EdgeTech
# url: https://github.com/Oshyan/discourse-chat-channel-categories
# required_version: 3.0.0

register_asset "stylesheets/common/discourse-chat-channel-categories.scss"

module ::DiscourseChatChannelCategories
  PLUGIN_NAME = "discourse-chat-channel-categories"
end

require_relative "lib/discourse_chat_channel_categories/engine"
