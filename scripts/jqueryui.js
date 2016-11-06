(function ($) {
    $.widget("ui.combobox", {
        _create: function () {
            var input,
					that = this,
					select = this.element.hide(),
					selected = select.children(":selected"),
					value = selected.val() ? selected.text() : "",
					wrapper = this.wrapper = $("<span>")
						.addClass("ui-combobox")
						.insertAfter(select);

            function removeIfInvalid(element) {
                var value = $(element).val(),
						matcher = new RegExp("^" + $.ui.autocomplete.escapeRegex(value) + "$", "i"),
						valid = false;
                select.children("option").each(function () {
                    if ($(this).text().match(matcher)) {
                        this.selected = valid = true;
                        return false;
                    }
                });
                if (!valid) {
                    $(element).val("");
                    select.val("");
                    input.data("autocomplete").term = "";
                    return false;
                }
            }

            input = $("<input>")
					.appendTo(wrapper)
					.val(value)
					.attr("title", "")
					.addClass("ui-state-default ui-combobox-input")
					.autocomplete({
					    delay: 0,
					    minLength: 0,
					    source: function (request, response) {
					        var matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
					        response(select.children("option").map(function () {
					            var text = $(this).text();
					            if (this.value && (!request.term || matcher.test(text)))
					                return {
					                    label: text.replace(
											new RegExp(
												"(?![^&;]+;)(?!<[^<>]*)(" +
												$.ui.autocomplete.escapeRegex(request.term) +
												")(?![^<>]*>)(?![^&;]+;)", "gi"
											), "<strong>$1</strong>"),
					                    value: text,
					                    option: this
					                };
					        }));
					    },
					    select: function (event, ui) {
					        ui.item.option.selected = true;
					        that._trigger("selected", event, {
					            item: ui.item.option
					        });
					    },
					    change: function (event, ui) {
					        if (!ui.item)
					            return removeIfInvalid(this);
					    }
					})
					.addClass("ui-widget ui-widget-content ui-corner-left");

            input.data("autocomplete")._renderItem = function (ul, item) {
                return $("<li>")
						.data("item.autocomplete", item)
						.append("<a>" + item.label + "</a>")
						.appendTo(ul);
            };       

            input.tooltip({
				position: {
					of: this.button
				},
				tooltipClass: "ui-state-highlight"
			});
        },

        destroy: function () {
            this.wrapper.remove();
            this.element.show();
            $.Widget.prototype.destroy.call(this);
        }
    });
})(jQuery);