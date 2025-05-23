import { useHeaders } from "@vuepress/helper/client";
import { useToggle, useWindowSize, watchImmediate } from "@vueuse/core";
import Bowser from "bowser";
import type { PropType, SlotsType, VNode } from "vue";
import {
  computed,
  defineComponent,
  h,
  onMounted,
  ref,
  resolveComponent,
  shallowRef,
  Teleport,
  toRef,
} from "vue";
import type { GetHeadersOptions, PageHeader } from "vuepress/client";
import {
  ClientOnly,
  RouteLink,
  usePageFrontmatter,
  useRoute,
} from "vuepress/client";
import PrintButton from "vuepress-theme-hope/modules/info/components/PrintButton";
import { useMetaLocale } from "vuepress-theme-hope/modules/info/composables/index";

import "../styles/toc.scss";

const TABLET_BREAKPOINT = 1440;

export default defineComponent({
  name: "TOC",

  props: {
    items: Array as PropType<PageHeader[]>,
    options: Object as PropType<GetHeadersOptions>,
  },

  slots: Object as SlotsType<{
    before?: () => VNode[] | VNode | null;
    after?: () => VNode[] | VNode | null;
  }>,

  setup(props, { slots }) {
    /* ------------------------- */
    /* TOC Original Function  */
    /* ------------------------- */
    const headerOptions = toRef(props, "options");
    const headers = useHeaders(headerOptions);
    const route = useRoute();
    const metaLocale = useMetaLocale();
    const [isExpanded, toggleExpanded] = useToggle();
    const { width } = useWindowSize();
    const isMobile = computed(() => width.value < TABLET_BREAKPOINT);

    const toc = shallowRef<HTMLElement>();
    const tocMarkerTop = ref("-1.7rem");
    const hasMobileTarget = ref(false);

    const scrollTo = (top: number) => {
      toc.value?.scrollTo({ top, behavior: "smooth" });
    };

    const updateTocMarker = () => {
      if (!toc.value) {
        tocMarkerTop.value = "-1.7rem";
        return;
      }
      const active = document.querySelector<HTMLElement>(".vp-toc-item.active");
      if (active) {
        const a = active.getBoundingClientRect();
        const t = toc.value.getBoundingClientRect();
        tocMarkerTop.value = `${a.top - t.top + toc.value.scrollTop}px`;
      } else {
        tocMarkerTop.value = "-1.7rem";
      }
    };

    /* ----------------------------- */
    /* Survey Form State & Logic  */
    /* ----------------------------- */
    const thumbsValue = ref<string | null>(null);
    const radioValue = ref<string>("");
    const freeText = ref<string>("");
    const email = ref<string>("");
    const submitted = ref(false);
    // New honeypot field for spam prevention
    const honeyPot = ref<string>("");

    // Global error message (for radio selection, etc.)
    const errorMessage = ref<string>("");

    // New email-specific error message for inline display
    const emailError = ref<string>("");

    // Determine survey options and placeholder text
    const surveyOptions = computed(() => {
      if (thumbsValue.value === "up") {
        return ["Easy to understand", "Solved my problem", "Other"];
      } else if (thumbsValue.value === "down") {
        return [
          "Hard to understand",
          "Did not solve my problem",
          "Not accurate",
          "Other",
        ];
      }
      return [];
    });

    const placeholderText = computed(() =>
      thumbsValue.value === "up"
        ? "What went well?"
        : thumbsValue.value === "down"
        ? "What can we do better?"
        : ""
    );

    const frontmatter = usePageFrontmatter();
    const enableIcon = computed(
      () =>
        frontmatter.value.breadcrumbIcon ??
        metaLocale.value.breadcrumbIcon ??
        true
    );

    // Submit function with validations, inline error messages, and localStorage caching
    const submitForm = async () => {
      // Clear previous global error messages
      errorMessage.value = "";
      // Note: emailError is kept until the user starts typing again

      // Check if a submission exists in localStorage for this page (prevent multiple submissions within 12 hours)
      const submissionKey = `DOC_FEEDBACK-${window.location.href}`;
      const submissionDataStr = localStorage.getItem(submissionKey);
      if (submissionDataStr) {
        const submissionData = JSON.parse(submissionDataStr);
        const twelveHours = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
        if (Date.now() - submissionData.timestamp < twelveHours) {
          errorMessage.value = "You have already submitted feedback recently.";
          return;
        }
      }

      // Check the honeypot field – if filled, ignore submission
      if (honeyPot.value) {
        console.warn("Spam submission detected, ignoring.");
        return;
      }

      // Validate that a radio option is selected
      if (!radioValue.value) {
        errorMessage.value = "Please select an option before submitting.";
        return;
      }

      // If an email is provided, validate it using a basic regex
      if (email.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.value)) {
          emailError.value = "Invalid e-mail.";
          return;
        }
      }

      const browserParser = Bowser.getParser(window.navigator.userAgent);
      const browserName = browserParser.getBrowserName();
      const platformType = browserParser.getPlatformType();

      const data = {
        thumbs: thumbsValue.value,
        option: radioValue.value,
        freeText: freeText.value,
        email: email.value,
        submittedAt: new Date().toString(),
        userAgent: navigator.userAgent,
        browserName,
        platformType,
        pageUrl: window.location.href,
      };

      try {
        await fetch("/api/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        // On successful submission, save the submission timestamp in localStorage
        localStorage.setItem(
          submissionKey,
          JSON.stringify({ timestamp: Date.now() })
        );
      } catch (err) {
        console.error("Survey submission failed", err);
      }
      submitted.value = true;
    };

    const hoveredThumb = ref<"up" | "down" | null>(null);

    const renderThumbButton = (thumb: "up" | "down"): VNode =>
      h(
        "button",
        {
          onClick: () => (thumbsValue.value = thumb),
          onMouseenter: () => (hoveredThumb.value = thumb),
          onMouseleave: () => (hoveredThumb.value = null),
          class: "survey-thumb-button",
        },
        [
          enableIcon.value
            ? h(resolveComponent("VPIcon"), {
                icon:
                  thumb === "up"
                    ? "material-symbols:thumb-up"
                    : "material-symbols:thumb-down",
                size: "1.5rem",
                color:
                  hoveredThumb.value === thumb || thumbsValue.value === thumb
                    ? "var(--theme-color)"
                    : "var(--vp-c-text-mute)",
              })
            : null,
        ]
      );

    // Render the survey form
    const renderSurveyForm = (): VNode => {
      if (submitted.value) {
        return h(
          "div",
          { class: "survey-thank-you" },
          "Thank you for helping improve Kurrent's documentation! ✅"
        );
      }

      return h("div", { class: "survey-form" }, [
        h("p", { class: "survey-question" }, "Was this helpful?"),
        h("div", { class: "survey-thumbs" }, [
          renderThumbButton("up"),
          renderThumbButton("down"),
        ]),
        thumbsValue.value
          ? h("div", { class: "survey-details" }, [
              // Global error message for other validations
              errorMessage.value
                ? h(
                    "div",
                    {
                      class: "survey-error",
                      style: { color: "red", marginBottom: "0.5rem" },
                    },
                    errorMessage.value
                  )
                : null,
              // --- Honey-pot field (hidden) ---
              h("input", {
                type: "text",
                value: honeyPot.value,
                onInput: (e: Event) => {
                  honeyPot.value = (e.target as HTMLInputElement).value;
                },
                style: { display: "none" },
                tabindex: -1,
                autocomplete: "off",
              }),
              // Radio options
              ...surveyOptions.value.map((option) =>
                h("label", { class: "survey-option-label" }, [
                  h("input", {
                    type: "radio",
                    name: "survey-option",
                    value: option,
                    checked: radioValue.value === option,
                    onChange: (e: Event) => {
                      radioValue.value = (e.target as HTMLInputElement).value;
                    },
                    required: true,
                  }),
                  " " + option,
                ])
              ),
              h("textarea", {
                placeholder: placeholderText.value,
                value: freeText.value,
                onInput: (e: Event) => {
                  freeText.value = (e.target as HTMLTextAreaElement).value;
                },
                class: "survey-textarea",
              }),
              // Email field with inline error message for invalid email
              h("label", { class: "survey-email-label" }, [
                "Leave your email if you wish to be contacted (Optional)",
                h("input", {
                  type: "email",
                  placeholder: "you@email.com",
                  value: email.value,
                  onInput: (e: Event) => {
                    email.value = (e.target as HTMLInputElement).value;
                    // Clear the email error when the user starts typing
                    if (emailError.value) emailError.value = "";
                  },
                  class: "survey-email",
                }),
                emailError.value
                  ? h(
                      "div",
                      {
                        class: "survey-email-error",
                        style: { color: "red", marginTop: "0.25rem" },
                      },
                      emailError.value
                    )
                  : null,
              ]),
              h(
                "button",
                {
                  onClick: submitForm,
                  class: "survey-submit-button",
                  disabled: !radioValue.value,
                },
                "Submit"
              ),
            ])
          : null,
      ]);
    };

    // ——— TOC rendering helpers ———
    const renderHeader = ({ title, level, slug }: PageHeader): VNode =>
      h(
        RouteLink,
        {
          to: `#${slug}`,
          class: ["vp-toc-link", `level${level}`],
          onClick: toggleExpanded,
        },
        () => title
      );

    const renderChildren = (list: PageHeader[]): VNode | null =>
      list.length
        ? h("ul", { class: "vp-toc-list" }, [
            ...list.map((hdr) => {
              const children = renderChildren(hdr.children);
              return [
                h(
                  "li",
                  {
                    class: [
                      "vp-toc-item",
                      { active: route.hash === `#${hdr.slug}` },
                    ],
                  },
                  renderHeader(hdr)
                ),
                children ? h("li", children) : null,
              ];
            }),
          ])
        : null;

    // ——— On mount: Teleport guard + watchers ———
    onMounted(() => {
      hasMobileTarget.value =
        !!document.querySelector<HTMLDivElement>("#markdown-content");

      // scroll on hash change
      watchImmediate(
        () => route.hash,
        (hash) => {
          if (!toc.value) return;
          const sel = `#toc a.vp-toc-link[href$="${hash}"]`;
          const activeEl = document.querySelector<HTMLElement>(sel);
          if (!activeEl) return;
          const tRect = toc.value.getBoundingClientRect();
          const aRect = activeEl.getBoundingClientRect();
          if (aRect.top < tRect.top) {
            scrollTo(toc.value.scrollTop + aRect.top - tRect.top);
          } else if (aRect.top + aRect.height > tRect.top + tRect.height) {
            scrollTo(
              toc.value.scrollTop +
                aRect.top +
                aRect.height -
                tRect.top -
                tRect.height
            );
          }
        },
        { flush: "post" }
      );

      // update marker on path change
      watchImmediate(() => route.fullPath, updateTocMarker, {
        flush: "post",
      });
    });

    // ——— Final render ———
    return () => {
      const tocHeaders = props.items?.length
        ? renderChildren(props.items)
        : renderChildren(headers.value);
      const before = slots.before?.();
      const after = slots.after?.();

      return h(ClientOnly, () => {
        if (!tocHeaders && !before && !after) return null;

        const tocBlock = h("div", { class: "vp-toc-placeholder" }, [
          h("aside", { id: "toc", "vp-toc": "" }, [
            before,
            tocHeaders && [
              h("div", { class: "vp-toc-header", onClick: toggleExpanded }, [
                metaLocale.value.toc,
                h(PrintButton),
                h("div", {
                  class: ["arrow", isExpanded.value ? "down" : "end"],
                }),
              ]),
              h(
                "div",
                {
                  class: ["vp-toc-wrapper", isExpanded.value ? "open" : ""],
                  ref: toc,
                },
                [
                  tocHeaders,
                  h("div", {
                    class: "vp-toc-marker",
                    style: { top: tocMarkerTop.value },
                  }),
                ]
              ),
            ],
            after,
            // desktop survey
            !isMobile.value &&
              h("div", { class: "toc-survey-section" }, [renderSurveyForm()]),
          ]),
        ]);

        // only teleport on mobile if target exists
        const mobileSurvey =
          isMobile.value && hasMobileTarget.value
            ? h(
                Teleport,
                { to: "#markdown-content", disabled: !hasMobileTarget.value },
                [renderSurveyForm()]
              )
            : null;

        return mobileSurvey ? [tocBlock, mobileSurvey] : tocBlock;
      });
    };
  },
});
