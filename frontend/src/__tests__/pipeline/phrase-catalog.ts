// Phrase catalog: the regression baseline for deterministic routing.
//
// Each row is a phrase a human might say, with the expected pipeline outcome.
// The test runner feeds every row through runPipeline (with mock Supabase,
// no LLM call ever happens) and checks: did it route where we expect?
//
// To add a phrase: append a row. That's it.
// To promote a phrase from LLM to deterministic: change expectedPath + fill in tool/status.
//
// expectedPath:
//   'deterministic' — handled on-device, no LLM needed
//   'llm'           — falls back to LLM (we want fewer of these over time)
//
// When expectedPath is 'llm', tool/status/verb are still checked if provided
// (useful for verifying extract still finds the verb even when classify can't route it).

export interface PhraseRow {
  readonly phrase: string;
  readonly expectedPath: 'deterministic' | 'llm';
  readonly expectedVerb?: string;
  readonly expectedTool?: string;
  readonly expectedStatus?: string;
  readonly expectedCallCount?: number;      // number of tool calls produced
  readonly expectedMentions?: string[];     // entity mention texts (order-independent)
  readonly tag: string; // category for filtering/reporting
}

// ---------------------------------------------------------------------------
// THE CATALOG
// ---------------------------------------------------------------------------

export const PHRASE_CATALOG: PhraseRow[] = [

  // ==========================================================================
  // TAG: core — basic verbs that must always work
  // ==========================================================================
  { phrase: 'buy milk',                                    expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 1, expectedMentions: ['milk'], tag: 'core' },
  { phrase: 'need eggs',                                   expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'core' },
  { phrase: 'add cereal to the list',                      expectedPath: 'deterministic', expectedVerb: 'add',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'core' },
  { phrase: 'bought paper towels',                         expectedPath: 'deterministic', expectedVerb: 'bought',    expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'core' },
  { phrase: 'purchased dish soap',                         expectedPath: 'deterministic', expectedVerb: 'purchased', expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'core' },
  { phrase: 'we have milk in the kitchen',                 expectedPath: 'deterministic', expectedVerb: 'have',      expectedTool: 'update_item',   expectedStatus: 'stocked',    tag: 'core' },
  { phrase: 'used one of the garbage bags',                expectedPath: 'deterministic', expectedVerb: 'used',      expectedTool: 'update_item',                                 tag: 'core' },
  { phrase: "we're out of eggs",                           expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'core' },
  { phrase: 'pick up eggs from Costco',                    expectedPath: 'deterministic', expectedVerb: 'pick up',   expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 1, expectedMentions: ['eggs', 'costco'], tag: 'core' },
  { phrase: 'I bought the eggs',                           expectedPath: 'deterministic', expectedVerb: 'bought',    expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'core' },
  { phrase: 'save the chicken tikka masala recipe',        expectedPath: 'deterministic', expectedVerb: 'save',      expectedTool: 'create_recipe',                                tag: 'core' },

  // ==========================================================================
  // TAG: inflection — verb tense/person variants routed via lemma fallback
  // ==========================================================================
  { phrase: 'I needed more milk',                          expectedPath: 'deterministic', expectedVerb: 'needed',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'inflection' },
  { phrase: 'she added eggs',                              expectedPath: 'deterministic', expectedVerb: 'added',     expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'he needs paper towels',                       expectedPath: 'deterministic', expectedVerb: 'needs',     expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'inflection' },
  { phrase: 'Justine buys cereal',                         expectedPath: 'deterministic', expectedVerb: 'buys',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'Jim adds eggs',                               expectedPath: 'deterministic', expectedVerb: 'adds',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'she saves the recipe',                        expectedPath: 'deterministic', expectedVerb: 'saves',     expectedTool: 'create_recipe',                                tag: 'inflection' },
  { phrase: 'he gets cereal',                              expectedPath: 'deterministic', expectedVerb: 'gets',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'she grabs dish soap',                         expectedPath: 'deterministic', expectedVerb: 'grabs',     expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'Jim puts milk on the list',                   expectedPath: 'deterministic', expectedVerb: 'puts',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },

  // ==========================================================================
  // TAG: quantity — numeric + unit extraction
  // ==========================================================================
  { phrase: 'buy 3 bags of cereal',                        expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'quantity' },
  { phrase: 'we have 10 rolls of toilet paper in the basement pantry', expectedPath: 'deterministic', expectedVerb: 'have', expectedTool: 'update_item', expectedStatus: 'stocked', tag: 'quantity' },
  { phrase: 'we have 5 rolls of paper towels',             expectedPath: 'deterministic', expectedVerb: 'have',      expectedTool: 'update_item',   expectedStatus: 'stocked',    tag: 'quantity' },
  { phrase: 'add 2 boxes of cereal',                       expectedPath: 'deterministic', expectedVerb: 'add',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'quantity' },
  { phrase: 'pick up 3 boxes of cereal from Costco',       expectedPath: 'deterministic', expectedVerb: 'pick up',   expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'quantity' },

  // ==========================================================================
  // TAG: action — reminders, scheduling, task completion
  // ==========================================================================
  { phrase: 'remind me about the dentist tomorrow',        expectedPath: 'deterministic', expectedVerb: 'remind',    expectedTool: 'create_action',                                tag: 'action' },
  { phrase: 'schedule a meeting next Monday',              expectedPath: 'deterministic', expectedVerb: 'schedule',  expectedTool: 'create_action',                                tag: 'action' },
  { phrase: 'create a task to clean the garage',           expectedPath: 'deterministic', expectedVerb: 'create',    expectedTool: 'create_action',                                tag: 'action' },
  { phrase: 'I finished mowing the lawn',                  expectedPath: 'deterministic', expectedVerb: 'finished',  expectedTool: 'update_action', expectedStatus: 'done',        tag: 'action' },
  { phrase: 'schedule a date night next Saturday evening', expectedPath: 'deterministic', expectedVerb: 'schedule',  expectedTool: 'create_action',                                tag: 'action' },
  { phrase: 'remind me Thursday about the dentist',        expectedPath: 'deterministic', expectedVerb: 'remind',    expectedTool: 'create_action',                                tag: 'action' },

  // ==========================================================================
  // TAG: wrapper — conversational padding that shouldn't break routing
  // ==========================================================================
  { phrase: 'hey we need milk',                            expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'wrapper' },
  { phrase: 'oh we need eggs',                             expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'wrapper' },
  { phrase: 'um buy paper towels',                         expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'can you buy milk please',                     expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'could you add eggs to the list',              expectedPath: 'deterministic', expectedVerb: 'add',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'please buy cereal',                           expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'just buy milk',                               expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'also need eggs',                              expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'wrapper' },
  { phrase: 'and pick up dish soap',                       expectedPath: 'deterministic', expectedVerb: 'pick up',   expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'oh and we need garbage bags',                 expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'wrapper' },
  { phrase: 'hey remind me to call the dentist',           expectedPath: 'deterministic', expectedVerb: 'remind',    expectedTool: 'create_action',                                tag: 'wrapper' },
  { phrase: 'yo grab some cereal',                         expectedPath: 'deterministic', expectedVerb: 'grab',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },
  { phrase: 'okay we need laundry detergent',              expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'wrapper' },
  { phrase: 'actually get some eggs',                      expectedPath: 'deterministic', expectedVerb: 'get',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'wrapper' },

  // ==========================================================================
  // TAG: contraction — apostrophes and shortened forms
  // ==========================================================================
  { phrase: "we're out of eggs",                           expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },
  { phrase: "I've finished mowing the lawn",               expectedPath: 'deterministic', expectedVerb: 'finished',  expectedTool: 'update_action', expectedStatus: 'done',        tag: 'contraction' },
  { phrase: "we're almost out of milk",                    expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },
  { phrase: "all out of dish soap",                        expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },

  // ==========================================================================
  // TAG: multi-entity — multiple same-typed entities expanded into N tool calls
  // ==========================================================================
  { phrase: 'buy milk and eggs',                           expectedPath: 'deterministic', expectedVerb: 'buy',     expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'pick up cereal and dish soap from Costco',    expectedPath: 'deterministic', expectedVerb: 'pick up', expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'need milk and paper towels',                  expectedPath: 'deterministic', expectedVerb: 'need',    expectedTool: 'update_item',   expectedStatus: 'needed',     expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'so we need cereal and dish soap',             expectedPath: 'deterministic', expectedVerb: 'need',    expectedTool: 'update_item',   expectedStatus: 'needed',     expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'get milk and cereal',                         expectedPath: 'deterministic', expectedVerb: 'get',     expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'grab eggs and dish soap',                     expectedPath: 'deterministic', expectedVerb: 'grab',    expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'got milk and eggs from Costco',               expectedPath: 'deterministic', expectedVerb: 'got',     expectedTool: 'update_item',   expectedStatus: 'purchased',  expectedCallCount: 2, tag: 'multi-entity' },
  { phrase: 'buy milk eggs and cereal',                    expectedPath: 'deterministic', expectedVerb: 'buy',     expectedTool: 'update_item',   expectedStatus: 'on_list',    expectedCallCount: 3, tag: 'multi-entity' },

  // ==========================================================================
  // TAG: compound-item — multi-word product names that must resolve as one entity
  // ==========================================================================
  { phrase: 'buy paper towels',                            expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'compound-item' },
  { phrase: 'need dish soap',                              expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'compound-item' },
  { phrase: 'need laundry detergent',                      expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'compound-item' },
  { phrase: 'buy garbage bags',                            expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'compound-item' },

  // ==========================================================================
  // TAG: person — person + item/action combinations
  // ==========================================================================
  { phrase: 'Jim needs milk',                              expectedPath: 'deterministic', expectedVerb: 'needs',     expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'person' },
  { phrase: 'Justine bought eggs',                         expectedPath: 'deterministic', expectedVerb: 'bought',    expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'person' },
  { phrase: 'tell Charlie to buy cereal',                  expectedPath: 'deterministic', expectedVerb: 'buy',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'person' },
  { phrase: 'Justine grabbed dish soap',                   expectedPath: 'deterministic', expectedVerb: 'grabbed',   expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'person' },
  { phrase: 'Jim picked up cereal',                        expectedPath: 'deterministic', expectedVerb: 'picked up', expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'person' },

  // ==========================================================================
  // TAG: get-grab — get/got/grab verb family
  // ==========================================================================
  { phrase: 'get milk',                                    expectedPath: 'deterministic', expectedVerb: 'get',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },
  { phrase: 'get some eggs',                               expectedPath: 'deterministic', expectedVerb: 'get',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },
  { phrase: 'got milk from Costco',                        expectedPath: 'deterministic', expectedVerb: 'got',       expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'get-grab' },
  { phrase: 'I got the eggs',                              expectedPath: 'deterministic', expectedVerb: 'got',       expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'get-grab' },
  { phrase: 'we got eggs',                                 expectedPath: 'deterministic', expectedVerb: 'got',       expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'get-grab' },
  { phrase: 'go get milk from Kroger',                     expectedPath: 'deterministic', expectedVerb: 'get',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },
  { phrase: 'grab some eggs',                              expectedPath: 'deterministic', expectedVerb: 'grab',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },
  { phrase: 'grabbed cereal from Target',                  expectedPath: 'deterministic', expectedVerb: 'grabbed',   expectedTool: 'update_item',   expectedStatus: 'purchased',  tag: 'get-grab' },
  { phrase: 'go grab cereal from Kroger',                  expectedPath: 'deterministic', expectedVerb: 'grab',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },
  { phrase: 'can you get some dish soap',                  expectedPath: 'deterministic', expectedVerb: 'get',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'get-grab' },

  // ==========================================================================
  // TAG: put — put verb family
  // ==========================================================================
  { phrase: 'put milk on the list',                        expectedPath: 'deterministic', expectedVerb: 'put',       expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'put' },

  // ==========================================================================
  // TAG: status-phrase — status expressions (running low, low on)
  // ==========================================================================
  { phrase: 'running low on dish soap',                    expectedPath: 'deterministic', expectedVerb: 'running low', expectedTool: 'update_item', expectedStatus: 'needed',     tag: 'status-phrase' },
  { phrase: 'low on garbage bags',                         expectedPath: 'deterministic', expectedVerb: 'low on',     expectedTool: 'update_item', expectedStatus: 'needed',     tag: 'status-phrase' },
  { phrase: "we're running low on milk",                   expectedPath: 'deterministic', expectedVerb: 'running low', expectedTool: 'update_item', expectedStatus: 'needed',     tag: 'status-phrase' },
  { phrase: "we're all set on cereal",                     expectedPath: 'deterministic', expectedVerb: 'all set',    expectedTool: 'update_item', expectedStatus: 'stocked',    tag: 'status-phrase' },

  // ==========================================================================
  // TAG: bare-noun — no verb, single known item → default to "need"
  // ==========================================================================
  { phrase: 'milk',                                        expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'eggs please',                                 expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'more paper towels',                           expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'cereal',                                      expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'toilet paper',                                expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'dish soap',                                   expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'garbage bags',                                expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },
  { phrase: 'laundry detergent',                           expectedPath: 'deterministic', expectedVerb: 'need',      expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'bare-noun' },

  // ==========================================================================
  // TAG: llm-known — phrases we KNOW require LLM today.
  // ==========================================================================

  // -- Bare noun multi-entity (no verb, multiple items) --
  { phrase: 'milk and eggs',                               expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },

  // "Theo has wrestling at 4" routes deterministic after has→have lemma fix.
  // Arguably wrong (should be create_action) but pipeline's current best guess.
  { phrase: 'Theo has wrestling at 4',                     expectedPath: 'deterministic', expectedVerb: 'has', tag: 'llm-known' },
  { phrase: 'organize the garage',                         expectedPath: 'llm',                            tag: 'llm-known' },

  // -- Negation (routes deterministic but WRONG — separate concern) --
  // { phrase: "we don't need paper towels", ... }  // TODO: negation detection
];
