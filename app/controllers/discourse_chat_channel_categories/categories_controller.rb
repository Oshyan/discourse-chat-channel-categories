# frozen_string_literal: true

module DiscourseChatChannelCategories
  class CategoriesController < ::Chat::ApiController
    def index
      return render_json_dump(categories: []) if !SiteSetting.enable_public_channels

      category_ids = visible_chat_category_ids
      categories = Category.where(id: category_ids).to_a
      parents_by_id =
        Category
          .where(id: categories.map(&:parent_category_id).compact)
          .index_by(&:id)

      render_json_dump(
        categories:
          categories
            .map { |category| serialize_category(category, parents_by_id[category.parent_category_id]) }
            .sort_by { |category| [category.dig(:parent, :name).to_s.downcase, category[:name].downcase] },
      )
    end

    private

    def visible_chat_category_ids
      scope =
        Chat::Channel
          .where(chatable_type: "Category")
          .where("chat_channels.id IN (#{Chat::ChannelFetcher.generate_allowed_channel_ids_sql(guardian, exclude_dm_channels: true)})")

      status = normalized_status
      scope = scope.where(status: status) if status.present?

      scope.distinct.pluck(:chatable_id)
    end

    def normalized_status
      status = params[:status].presence
      return nil if status.blank? || status == "all"

      Chat::Channel.statuses.key?(status) ? status : nil
    end

    def serialize_category(category, parent = nil)
      {
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        parent_category_id: category.parent_category_id,
        url: category.url,
        parent: parent ? serialize_parent_category(parent) : nil,
      }
    end

    def serialize_parent_category(category)
      {
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        parent_category_id: category.parent_category_id,
        url: category.url,
      }
    end
  end
end
