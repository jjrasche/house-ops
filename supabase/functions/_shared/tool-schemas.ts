// OpenAI-compatible tool definitions for HouseOps NLI.
// Each tool maps 1:1 to a Supabase REST operation on shared tables.
// Frontend executes approved tool calls via supabase-js .insert()/.update().

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

// -- Inventory --

const addInventoryItem: ToolSchema = {
  type: "function",
  function: {
    name: "add_inventory_item",
    description:
      "Add a new item to household inventory. Use when someone mentions buying, stocking, or having something.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name" },
        category: {
          type: "string",
          description:
            "Category (e.g. pantry, cleaning, toiletries, medicine, hardware)",
        },
        quantity: { type: "number", description: "Current quantity on hand" },
        unit: {
          type: "string",
          description: "Unit of measure (e.g. count, oz, lbs, gallons, boxes)",
        },
        location: {
          type: "string",
          description:
            "Where the item is stored (plain text — API resolves to location_id)",
        },
        reorder_threshold: {
          type: "number",
          description:
            "Quantity at which to auto-add to shopping list. Defaults to 0.",
        },
      },
      required: ["name"],
    },
  },
};

const updateInventoryQuantity: ToolSchema = {
  type: "function",
  function: {
    name: "update_inventory_quantity",
    description:
      "Update the quantity of an existing inventory item. Use when someone uses something up, restocks, or adjusts counts.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name to look up in inventory",
        },
        quantity: { type: "number", description: "New absolute quantity" },
        delta: {
          type: "number",
          description:
            "Relative change (e.g. -1 to decrement). Use quantity OR delta, not both.",
        },
      },
      required: ["name"],
    },
  },
};

// -- Shopping --

const addShoppingListItem: ToolSchema = {
  type: "function",
  function: {
    name: "add_shopping_list_item",
    description:
      "Add an item to the shopping list. Use when someone says they need to buy something.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item to buy" },
        quantity_needed: { type: "number", description: "How many to buy" },
        store_section: {
          type: "string",
          description:
            "Aisle or section (e.g. produce, dairy, frozen, cleaning)",
        },
      },
      required: ["name"],
    },
  },
};

const markItemPurchased: ToolSchema = {
  type: "function",
  function: {
    name: "mark_item_purchased",
    description:
      "Mark a shopping list item as purchased. Use when someone says they bought something.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Shopping list item name to mark as purchased",
        },
      },
      required: ["name"],
    },
  },
};

// -- Tasks --

const createTask: ToolSchema = {
  type: "function",
  function: {
    name: "create_task",
    description:
      "Create a household task. Use for chores, to-dos, reminders, or maintenance items.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: {
          type: "string",
          description: "Additional details about the task",
        },
        category: {
          type: "string",
          description:
            "Category (e.g. cleaning, maintenance, errands, kids, pets)",
        },
        assigned_to: {
          type: "string",
          description:
            "Person name to assign to (plain text — API resolves to person_id)",
        },
        due_date: {
          type: "string",
          description: "Due date in ISO 8601 format (YYYY-MM-DD or full datetime)",
        },
        recurrence_interval: {
          type: "string",
          description: "How often the task repeats (e.g. \"3\"). Used with recurrence_unit. Parsed to integer by the API.",
        },
        recurrence_unit: {
          type: "string",
          description: "Unit for recurrence interval",
          enum: ["days", "weeks", "months", "years"],
        },
      },
      required: ["title"],
    },
  },
};

const completeTask: ToolSchema = {
  type: "function",
  function: {
    name: "complete_task",
    description:
      "Mark a task as done. Recurring tasks auto-advance to next due date via database trigger.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title to look up and complete",
        },
      },
      required: ["title"],
    },
  },
};

// -- Events --

const addEvent: ToolSchema = {
  type: "function",
  function: {
    name: "add_event",
    description:
      "Add a calendar event. Use for appointments, activities, school events, or date nights.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event details" },
        category: {
          type: "string",
          description:
            "Category (e.g. appointment, school, sports, social, maintenance, relationship)",
        },
        date: {
          type: "string",
          description: "Start date/time in ISO 8601 format",
        },
        end_date: {
          type: "string",
          description: "End date/time in ISO 8601 format",
        },
        all_day: {
          type: "boolean",
          description: "Whether this is an all-day event",
        },
        person: {
          type: "string",
          description:
            "Person this event is for (plain text — API resolves to person_id)",
        },
      },
      required: ["title", "date"],
    },
  },
};

// -- Recipes --

const createRecipe: ToolSchema = {
  type: "function",
  function: {
    name: "create_recipe",
    description:
      "Save a new recipe. Include ingredients and steps if provided.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Recipe name" },
        method: {
          type: "string",
          description: "Cooking method",
          enum: [
            "instant_pot",
            "air_fryer",
            "stovetop",
            "oven",
            "grill",
            "other",
          ],
        },
        prep_time_minutes: {
          type: "number",
          description: "Preparation time in minutes",
        },
        tags: {
          type: "array",
          description: "Tags (e.g. quick, kid-friendly, vegetarian)",
          items: { type: "string" },
        },
        notes: { type: "string", description: "Cooking notes or tips" },
        ingredients: {
          type: "array",
          description: "List of ingredients with name, quantity, and unit",
          items: { type: "object" },
        },
        steps: {
          type: "array",
          description:
            "Ordered cooking steps with instruction and optional duration_minutes",
          items: { type: "object" },
        },
      },
      required: ["name"],
    },
  },
};

const planMeal: ToolSchema = {
  type: "function",
  function: {
    name: "plan_meal",
    description:
      "Add a meal to the meal plan. Links a recipe to a date and meal slot. Triggers auto-shopping for missing ingredients.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date for the meal (YYYY-MM-DD)",
        },
        meal: {
          type: "string",
          description: "Meal slot",
          enum: ["breakfast", "lunch", "dinner", "snack"],
        },
        recipe_name: {
          type: "string",
          description:
            "Recipe name to look up (plain text — API resolves to recipe_id)",
        },
        notes: { type: "string", description: "Meal notes (e.g. halve the recipe)" },
      },
      required: ["date", "meal", "recipe_name"],
    },
  },
};

// -- People --

const addPersonAttribute: ToolSchema = {
  type: "function",
  function: {
    name: "add_person_attribute",
    description:
      "Record an attribute about a person (EAV pattern). Use for sizes, preferences, allergies, school info, etc.",
    parameters: {
      type: "object",
      properties: {
        person: {
          type: "string",
          description:
            "Person name (plain text — API resolves to person_id)",
        },
        attribute_type: {
          type: "string",
          description:
            "Attribute key (e.g. shoe_size, shirt_size, allergy, school, teacher)",
        },
        value: {
          type: "string",
          description: "Attribute value",
        },
      },
      required: ["person", "attribute_type", "value"],
    },
  },
};

const logRelationshipDate: ToolSchema = {
  type: "function",
  function: {
    name: "log_relationship_date",
    description:
      "Log that a relationship date occurred (date night, one-on-one time). Resets the frequency timer.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Relationship type",
          enum: ["partner", "parent_child"],
        },
        person: {
          type: "string",
          description:
            "Person name for parent_child type (plain text — API resolves to person_id). Omit for partner.",
        },
      },
      required: ["type"],
    },
  },
};

// -- Locations --

const addLocation: ToolSchema = {
  type: "function",
  function: {
    name: "add_location",
    description:
      "Add a storage location to the household. Supports hierarchy via parent location.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Location name (e.g. Garage Shelf 3)" },
        parent_location: {
          type: "string",
          description:
            "Parent location name for hierarchy (plain text — API resolves to parent_location_id)",
        },
      },
      required: ["name"],
    },
  },
};

// -- Exported collection --

export const TOOL_SCHEMAS: ToolSchema[] = [
  addInventoryItem,
  updateInventoryQuantity,
  addShoppingListItem,
  markItemPurchased,
  createTask,
  completeTask,
  addEvent,
  createRecipe,
  planMeal,
  addPersonAttribute,
  logRelationshipDate,
  addLocation,
];

export const TOOL_NAMES = TOOL_SCHEMAS.map(
  (schema) => schema.function.name,
);
