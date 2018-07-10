
const MODULE = 'm';
const EXPORTS = 'e';
const REQUIRE = 'r';

const defaultModuleHash = path => path;
const defaultExclude = ['types'];

const SAFE_IMPORT = `
function __imp(p, n){
  try{return ${REQUIRE}(p)}
  catch(e){
    console.error('[Devtools]: Module "' + n + '" was not found!');
  }
}`;

const templates = (t) => ({
  ImportDefaultSpecifier: t(`var VARIABLE = ${REQUIRE}.n(NAMESPACE)['a'];`),
  ImportNamespaceSpecifier: t(`var VARIABLE = NAMESPACE;`),
  ImportSpecifier: t(`var VARIABLE = NAMESPACE[NAME];`),
  ExportNamedDeclaration: t(`${REQUIRE}.d(${EXPORTS}, NAME, function() { return BODY; });`),
  ExportDefaultDeclaration: t(`${REQUIRE}.d(${EXPORTS}, "default", function() { return BODY; });`),
  imports: t(`var NAMESPACE = __imp(HASH, PATH);`),
  module: t(`
    (function(${MODULE},${EXPORTS},${REQUIRE}){
      ${REQUIRE}.r(${EXPORTS});
      ${SAFE_IMPORT}
      IMPORTS
      BODY
    })
  `),
});

const makeImport = (path, hash, cache) => ({
  namespace: `_i${cache.length}`,
  hash,
  path,
})

module.exports = ({ types: t, template }) => {
  const tpls = templates(template);

  return {
    pre() {
      this.cache = [];
    },
    visitor: {
      Program: {
        exit(path) {
          const { node } = path;
          const IMPORTS = this.cache
          .filter(i => !i.defaultImport)
          .map(i =>
            tpls.imports({
              NAMESPACE: t.identifier(i.namespace),
              HASH: t.stringLiteral(i.hash),
              PATH: t.stringLiteral(i.path)
            })
          )
          const BODY = node.body;
          const content = tpls.module({ BODY, IMPORTS });
          path.node.directives = [];
          path.node.body = [];
          path.pushContainer("body", [content]);
        }
      },
      ImportDeclaration(path, { opts: options }) {
        const node = path.node;
        const exclude = options.exclude || defaultExclude;
        const moduleHash = options.moduleHash || defaultModuleHash;
        if (exclude.includes(node.source.value)) return path.remove();
        const hash = moduleHash(node.source.value);
        const imports = makeImport(
          node.source.value,
          hash,
          this.cache,
        );
      
        const res = node.specifiers.map(s => {
          const props = {
            VARIABLE: t.identifier(s.local.name),
            NAMESPACE: t.identifier(imports.namespace)
          }
          if (s.type === 'ImportSpecifier') {
            props.NAME = t.stringLiteral(s.local.name)
          }
          this.cache.push(imports);
          return tpls[s.type](props);
        });
        path.replaceWithMultiple(res)
      },
      ExportDeclaration(path) {
        const node = path.node;
        if (node.declaration.type.includes('TS')) return path.remove();
        const tpl = tpls[node.type];
        const props = node.type === 'ExportDefaultDeclaration'
          ? { BODY: node.declaration }
          : {
            NAME: t.stringLiteral(node.declaration.declarations[0].id.name),
            BODY: node.declaration.declarations[0].init
          }
        path.replaceWith(tpl(props))
      }
    }
  }
}
