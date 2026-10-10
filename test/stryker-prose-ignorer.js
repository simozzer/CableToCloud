// Stryker plugin: don't mutate the words players read in briefings, hints and summaries.
//
// Mutation testing changes code (e.g. `a < b` to `a <= b`) and checks a test notices. Changing the wording of a
// briefing doesn't change how the game behaves, so those mutants would only measure whether tests pin down prose,
// which they deliberately don't. Behaviour (setup, objective checks, verify, review, the simulation) is still mutated.
const { PluginKind, declareValuePlugin } = require('@stryker-mutator/api/plugin');

// Level and device-type properties that are pure text for the player.
const PROSE = new Set(['title', 'subtitle', 'briefing', 'hints', 'learned', 'solution', 'text', 'label', 'desc', 'long', 'role']);

const keyName = p => p.node.key && (p.node.key.name || p.node.key.value);

module.exports.strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'prose', {
    shouldIgnore(path) {
      const prop = path.findParent(p => p.isObjectProperty() && PROSE.has(keyName(p)));
      if (prop) return `“${keyName(prop)}” is text for the player, not behaviour`;
      // Constants that only hold HTML for briefings (e.g. the subnet cheat sheet, the office plan table).
      const decl = path.findParent(p => p.isVariableDeclarator());
      if (decl && /^(SIZES_TABLE|RULES_CONCEPTS|HR_ROW|officePlan|helperBtn)$/.test(decl.node.id && decl.node.id.name)) return 'briefing text';
      return undefined;
    },
  }),
];
