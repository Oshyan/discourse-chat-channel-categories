# frozen_string_literal: true

module DiscourseChatChannelCategories
  class ActiveChannelsController < ::Chat::ApiController
    DEFAULT_LIMIT = 5
    MAX_LIMIT = 8

    def index
      return render_json_dump(channels: []) if !SiteSetting.enable_public_channels

      channels =
        Chat::Channel
          .includes(:last_message, chatable: :parent_category)
          .where(chatable_type: "Category", status: :open)
          .where(
            "chat_channels.id IN (#{Chat::ChannelFetcher.generate_allowed_channel_ids_sql(guardian, exclude_dm_channels: true)})",
          )
          .where.not(last_message_id: nil)
          .order(last_message_id: :desc)
          .limit(limit)

      render_json_dump(channels: channels.map { |channel| serialize_channel(channel) })
    end

    private

    def limit
      requested = params[:limit].to_i
      requested = DEFAULT_LIMIT if requested <= 0
      requested.clamp(1, MAX_LIMIT)
    end

    def serialize_channel(channel)
      category = channel.chatable
      parent = category&.parent_category

      {
        id: channel.id,
        name: channel.name.presence || category&.name,
        slug: channel.slug,
        url: channel.relative_url,
        member_count: channel.user_count,
        last_activity_at: channel.last_message&.created_at&.iso8601,
        category:
          category && {
            id: category.id,
            name: category.name,
            color: category.color,
            parent: parent && { id: parent.id, name: parent.name, color: parent.color },
          },
      }
    end
  end
end
