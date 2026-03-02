import type { PageRecipeId, PageScaffoldParams, WidgetTreeSpecNode } from "../types.js";

export interface ScaffoldRecipeBuild {
  recipe: PageRecipeId;
  params: PageScaffoldParams;
  children: WidgetTreeSpecNode[];
  requiredRoles: string[];
  supportsWireActions: boolean;
  suggestedNext?: { cmd: string; args?: Record<string, unknown> };
}

const RECIPES: PageRecipeId[] = [
  "auth.login",
  "auth.signup",
  "settings.basic",
  "list.cards.search",
  "detail.basic"
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function strList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    return out.length > 0 ? out : fallback;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const out = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return out.length > 0 ? out : fallback;
  }
  return fallback;
}

function textNode(text: string, themeStyle: string, role?: string, name?: string): WidgetTreeSpecNode {
  return {
    type: "Text",
    ...(name ? { name } : {}),
    meta: role ? { role } : undefined,
    props: {
      text: {
        themeStyle,
        selectable: false,
        textValue: {
          inputValue: text,
          mostRecentInputValue: text
        }
      }
    }
  };
}

function spacer(height: number): WidgetTreeSpecNode {
  return {
    type: "SizedBox",
    props: { sizedBox: { heightValue: { inputValue: height } } }
  };
}

function textFieldNode(label: string, role: string, passwordField = false): WidgetTreeSpecNode {
  return {
    type: "TextField",
    meta: { role },
    props: {
      label: {
        textValue: {
          inputValue: label,
          mostRecentInputValue: label
        }
      },
      textField: {
        passwordField
      }
    }
  };
}

function buttonNode(label: string, role: string): WidgetTreeSpecNode {
  return {
    type: "Button",
    meta: { role },
    props: {
      button: {
        text: {
          textValue: {
            inputValue: label,
            mostRecentInputValue: label
          }
        }
      }
    }
  };
}

function authShell(children: WidgetTreeSpecNode[]): WidgetTreeSpecNode {
  return {
    type: "SafeArea",
    children: [
      {
        type: "Center",
        children: [
          {
            type: "ConstrainedBox",
            props: {
              constraints: {
                maxWidthValue: { inputValue: 420 }
              }
            },
            children: [
              {
                type: "SingleChildScrollView",
                children: [
                  {
                    type: "Padding",
                    props: {
                      padding: {
                        type: "FF_PADDING_ALL",
                        allValue: { inputValue: 24 }
                      }
                    },
                    children: [
                      {
                        type: "Column",
                        props: {
                          column: {
                            crossAxisAlignment: "STRETCH",
                            mainAxisSize: "MIN"
                          }
                        },
                        children
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildAuthLogin(rawParams: PageScaffoldParams): ScaffoldRecipeBuild {
  const params = asObject(rawParams);
  const title = str(params.title, "Welcome back");
  const subtitle = str(params.subtitle, "Sign in to continue");
  const primaryCta = str(params.primaryCta, "Sign In");
  const forgotPassword = str(params.forgotPassword, "Forgot password?");
  const secondaryLink = str(params.secondaryLink, "Create account");
  const fields = strList(params.fields, ["email", "password"]).map((entry) => entry.toLowerCase());

  const formChildren: WidgetTreeSpecNode[] = [
    textNode(title, "HEADLINE_MEDIUM", "titleText"),
    spacer(12),
    textNode(subtitle, "BODY_MEDIUM", "subtitleText")
  ];
  if (fields.includes("email")) {
    formChildren.push(spacer(16), textFieldNode("Email", "emailField"));
  }
  if (fields.includes("password")) {
    formChildren.push(spacer(12), textFieldNode("Password", "passwordField", true));
  }
  formChildren.push(
    spacer(12),
    {
      type: "Align",
      props: { align: { alignment: "CENTER_RIGHT" } },
      children: [textNode(forgotPassword, "BODY_SMALL", "forgotPasswordLink")]
    },
    spacer(20),
    {
      type: "Container",
      props: {
        container: {
          width: { inputValue: 9999 }
        }
      },
      children: [buttonNode(primaryCta, "primaryCta")]
    },
    spacer(12),
    textNode(secondaryLink, "BODY_MEDIUM", "secondaryLink")
  );

  return {
    recipe: "auth.login",
    params: {
      title,
      subtitle,
      primaryCta,
      forgotPassword,
      secondaryLink,
      fields
    },
    children: [authShell(formChildren)],
    requiredRoles: ["primaryCta", "emailField", "passwordField"],
    supportsWireActions: true,
    suggestedNext: {
      cmd: "routes.upsert",
      args: {
        nameOrId: "<new-page-id>",
        nodeId: "<primary-cta-node-id>",
        toPageNameOrId: "<destination-page>",
        apply: true
      }
    }
  };
}

function buildAuthSignup(rawParams: PageScaffoldParams): ScaffoldRecipeBuild {
  const params = asObject(rawParams);
  const title = str(params.title, "Create your account");
  const subtitle = str(params.subtitle, "Sign up to get started");
  const primaryCta = str(params.primaryCta, "Create Account");
  const secondaryLink = str(params.secondaryLink, "Back to sign in");

  const formChildren: WidgetTreeSpecNode[] = [
    textNode(title, "HEADLINE_MEDIUM", "titleText"),
    spacer(12),
    textNode(subtitle, "BODY_MEDIUM", "subtitleText"),
    spacer(16),
    textFieldNode("Email", "emailField"),
    spacer(12),
    textFieldNode("Password", "passwordField", true),
    spacer(12),
    textFieldNode("Confirm Password", "confirmPasswordField", true),
    spacer(20),
    {
      type: "Container",
      props: {
        container: {
          width: { inputValue: 9999 }
        }
      },
      children: [buttonNode(primaryCta, "primaryCta")]
    },
    spacer(12),
    textNode(secondaryLink, "BODY_MEDIUM", "secondaryLink")
  ];

  return {
    recipe: "auth.signup",
    params: {
      title,
      subtitle,
      primaryCta,
      secondaryLink
    },
    children: [authShell(formChildren)],
    requiredRoles: ["primaryCta", "emailField", "passwordField", "confirmPasswordField"],
    supportsWireActions: true,
    suggestedNext: {
      cmd: "routes.upsert",
      args: {
        nameOrId: "<new-page-id>",
        nodeId: "<primary-cta-node-id>",
        toPageNameOrId: "<destination-page>",
        apply: true
      }
    }
  };
}

function buildSettingsBasic(rawParams: PageScaffoldParams): ScaffoldRecipeBuild {
  const params = asObject(rawParams);
  const title = str(params.title, "Settings");
  const toggles = strList(params.toggles, ["Notifications", "Dark mode"]);

  const rows: WidgetTreeSpecNode[] = toggles.flatMap((toggle, index) => [
    {
      type: "Row",
      meta: { role: `toggleRow${index + 1}` },
      props: {
        row: {
          mainAxisAlignment: "SPACE_BETWEEN",
          crossAxisAlignment: "CENTER"
        }
      },
      children: [
        textNode(toggle, "BODY_MEDIUM"),
        {
          type: "Switch",
          props: { switch: {} }
        }
      ]
    },
    spacer(12)
  ]);

  return {
    recipe: "settings.basic",
    params: { title, toggles },
    children: [
      {
        type: "SafeArea",
        children: [
          {
            type: "SingleChildScrollView",
            children: [
              {
                type: "Padding",
                props: {
                  padding: {
                    type: "FF_PADDING_ALL",
                    allValue: { inputValue: 20 }
                  }
                },
                children: [
                  {
                    type: "Column",
                    props: { column: { crossAxisAlignment: "STRETCH" } },
                    children: [textNode(title, "HEADLINE_MEDIUM", "titleText"), spacer(16), ...rows]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    requiredRoles: ["titleText"],
    supportsWireActions: false
  };
}

function buildListCardsSearch(rawParams: PageScaffoldParams): ScaffoldRecipeBuild {
  const params = asObject(rawParams);
  const title = str(params.title, "Browse");
  const searchPlaceholder = str(params.searchPlaceholder, "Search");
  const cardTitle = str(params.cardTitle, "Item");
  const cardSubtitle = str(params.cardSubtitle, "Description");

  const cardNode = (role: string): WidgetTreeSpecNode => ({
    type: "Container",
    meta: { role },
    props: { container: {} },
    children: [
      {
        type: "Padding",
        props: {
          padding: { type: "FF_PADDING_ALL", allValue: { inputValue: 12 } }
        },
        children: [
          {
            type: "Column",
            props: { column: { crossAxisAlignment: "START", mainAxisSize: "MIN" } },
            children: [textNode(cardTitle, "TITLE_MEDIUM"), spacer(4), textNode(cardSubtitle, "BODY_SMALL")]
          }
        ]
      }
    ]
  });

  return {
    recipe: "list.cards.search",
    params: { title, searchPlaceholder, cardTitle, cardSubtitle },
    children: [
      {
        type: "SafeArea",
        children: [
          {
            type: "Padding",
            props: {
              padding: { type: "FF_PADDING_ALL", allValue: { inputValue: 16 } }
            },
            children: [
              {
                type: "Column",
                props: { column: { crossAxisAlignment: "STRETCH" } },
                children: [
                  textNode(title, "HEADLINE_MEDIUM", "titleText"),
                  spacer(12),
                  {
                    type: "TextField",
                    meta: { role: "searchInput" },
                    props: {
                      hintText: {
                        textValue: {
                          inputValue: searchPlaceholder,
                          mostRecentInputValue: searchPlaceholder
                        }
                      }
                    }
                  },
                  spacer(12),
                  {
                    type: "Expanded",
                    meta: { role: "listRegion" },
                    children: [
                      {
                        type: "ListView",
                        children: [cardNode("card1"), spacer(8), cardNode("card2")]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    requiredRoles: ["searchInput", "listRegion"],
    supportsWireActions: false
  };
}

function buildDetailBasic(rawParams: PageScaffoldParams): ScaffoldRecipeBuild {
  const params = asObject(rawParams);
  const title = str(params.title, "Detail");
  const subtitle = str(params.subtitle, "Overview");
  const primaryCta = str(params.primaryCta, "Continue");

  return {
    recipe: "detail.basic",
    params: { title, subtitle, primaryCta },
    children: [
      {
        type: "SafeArea",
        children: [
          {
            type: "SingleChildScrollView",
            children: [
              {
                type: "Padding",
                props: {
                  padding: { type: "FF_PADDING_ALL", allValue: { inputValue: 20 } }
                },
                children: [
                  {
                    type: "Column",
                    props: { column: { crossAxisAlignment: "STRETCH" } },
                    children: [
                      textNode(title, "HEADLINE_MEDIUM", "titleText"),
                      spacer(10),
                      textNode(subtitle, "BODY_MEDIUM", "subtitleText"),
                      spacer(16),
                      {
                        type: "Container",
                        props: { container: { height: { inputValue: 180 } } },
                        meta: { role: "mediaBlock" }
                      },
                      spacer(16),
                      textNode("Content section", "BODY_MEDIUM"),
                      spacer(20),
                      {
                        type: "Container",
                        props: {
                          container: { width: { inputValue: 9999 } }
                        },
                        children: [buttonNode(primaryCta, "primaryCta")]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    requiredRoles: ["titleText", "primaryCta"],
    supportsWireActions: false
  };
}

export function listPageRecipes(): PageRecipeId[] {
  return [...RECIPES];
}

export function isPageRecipeId(value: string): value is PageRecipeId {
  return RECIPES.includes(value as PageRecipeId);
}

export function buildScaffoldRecipe(recipe: PageRecipeId, rawParams: PageScaffoldParams = {}): ScaffoldRecipeBuild {
  if (recipe === "auth.login") {
    return buildAuthLogin(rawParams);
  }
  if (recipe === "auth.signup") {
    return buildAuthSignup(rawParams);
  }
  if (recipe === "settings.basic") {
    return buildSettingsBasic(rawParams);
  }
  if (recipe === "list.cards.search") {
    return buildListCardsSearch(rawParams);
  }
  return buildDetailBasic(rawParams);
}
