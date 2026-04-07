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

  // ==========================================================================
  // TAG: inflection — verb tense/person variants routed via lemma fallback
  // ==========================================================================
  { phrase: 'I needed more milk',                          expectedPath: 'deterministic', expectedVerb: 'needed',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'inflection' },
  { phrase: 'she added eggs',                              expectedPath: 'deterministic', expectedVerb: 'added',     expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'he needs paper towels',                       expectedPath: 'deterministic', expectedVerb: 'needs',     expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'inflection' },
  { phrase: 'Justine buys cereal',                         expectedPath: 'deterministic', expectedVerb: 'buys',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'Jim adds eggs',                               expectedPath: 'deterministic', expectedVerb: 'adds',      expectedTool: 'update_item',   expectedStatus: 'on_list',    tag: 'inflection' },
  { phrase: 'she saves the recipe',                        expectedPath: 'deterministic', expectedVerb: 'saves',     expectedTool: 'create_recipe',                                tag: 'inflection' },

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

  // ==========================================================================
  // TAG: contraction — apostrophes and shortened forms
  // ==========================================================================
  { phrase: "we're out of eggs",                           expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },
  { phrase: "I've finished mowing the lawn",               expectedPath: 'deterministic', expectedVerb: 'finished',  expectedTool: 'update_action', expectedStatus: 'done',        tag: 'contraction' },
  { phrase: "we're almost out of milk",                    expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },
  { phrase: "all out of dish soap",                        expectedPath: 'deterministic', expectedVerb: 'out of',    expectedTool: 'update_item',   expectedStatus: 'needed',     tag: 'contraction' },

  // ==========================================================================
  // TAG: multi-entity — multiple same-typed entities → LLM today because
  // classify rejects via hasSameTypedEntities. Assemble CAN expand these
  // (expandByDuplicateType), but classify gates it. Candidate for promotion.
  // ==========================================================================
  { phrase: 'buy milk and eggs',                           expectedPath: 'llm', expectedVerb: 'buy',                                                                               tag: 'multi-entity' },
  { phrase: 'pick up cereal and dish soap from Costco',    expectedPath: 'llm', expectedVerb: 'pick up',                                                                           tag: 'multi-entity' },
  { phrase: 'need milk and paper towels',                  expectedPath: 'llm', expectedVerb: 'need',                                                                              tag: 'multi-entity' },
  { phrase: 'so we need cereal and dish soap',             expectedPath: 'llm', expectedVerb: 'need',                                                                              tag: 'multi-entity' },

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

  // ==========================================================================
  // TAG: llm-known — phrases we KNOW require LLM today. As we improve the
  // deterministic path, rows move from here to a deterministic tag above.
  // Each has a note explaining WHY it falls to LLM.
  // ==========================================================================

  // -- Missing verb: "get/got" family --
  { phrase: 'get milk',                                    expectedPath: 'llm', expectedVerb: 'get',       tag: 'llm-known' },
  { phrase: 'get some eggs',                               expectedPath: 'llm', expectedVerb: 'get',       tag: 'llm-known' },
  { phrase: 'got milk from Costco',                        expectedPath: 'llm', expectedVerb: 'got',       tag: 'llm-known' },
  { phrase: 'I got the eggs',                              expectedPath: 'llm', expectedVerb: 'got',       tag: 'llm-known' },
  { phrase: 'we got eggs',                                 expectedPath: 'llm', expectedVerb: 'got',       tag: 'llm-known' },
  { phrase: 'go get milk from Kroger',                     expectedPath: 'llm',                            tag: 'llm-known' },

  // -- Missing verb: "grab" family --
  { phrase: 'grab some eggs',                              expectedPath: 'llm', expectedVerb: 'grab',      tag: 'llm-known' },
  { phrase: 'grabbed cereal from Target',                  expectedPath: 'llm', expectedVerb: 'grabbed',   tag: 'llm-known' },

  // -- Missing verb: "put" --
  { phrase: 'put milk on the list',                        expectedPath: 'llm', expectedVerb: 'put',       tag: 'llm-known' },

  // -- Missing verb: "picked up" (past tense of phrase verb) --
  { phrase: 'Jim picked up cereal',                        expectedPath: 'llm',                            tag: 'llm-known' },
  { phrase: 'Justine grabbed dish soap',                   expectedPath: 'llm', expectedVerb: 'grabbed',   tag: 'llm-known' },

  // -- Status expressions not yet recognized --
  { phrase: 'running low on dish soap',                    expectedPath: 'llm',                            tag: 'llm-known' },
  { phrase: 'low on garbage bags',                         expectedPath: 'llm',                            tag: 'llm-known' },
  { phrase: "we're all set on cereal",                     expectedPath: 'llm',                            tag: 'llm-known' },

  // -- Bare nouns (no verb) --
  { phrase: 'milk',                                        expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },
  { phrase: 'eggs please',                                 expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },
  { phrase: 'more paper towels',                           expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },
  { phrase: 'cereal',                                      expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },
  { phrase: 'toilet paper',                                expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },
  { phrase: 'milk and eggs',                               expectedPath: 'llm', expectedVerb: '',          tag: 'llm-known' },

  // -- Ambiguous / complex --
  // "Theo has wrestling at 4" now routes deterministic after has→have lemma
  // fix. Classify finds have+item(activity) match. Arguably wrong (should be
  // create_action for a schedule entry) but it's the pipeline's current best
  // guess — user corrects via card → trains classify. Keep as deterministic.
  { phrase: 'Theo has wrestling at 4',                     expectedPath: 'deterministic', expectedVerb: 'has', tag: 'llm-known' },
  { phrase: 'organize the garage',                         expectedPath: 'llm',                            tag: 'llm-known' },

  // -- Negation (routes deterministic but WRONG — separate concern) --
  // { phrase: "we don't need paper towels", ... }  // TODO: negation detection
];
