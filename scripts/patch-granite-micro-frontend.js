const fs = require('node:fs');
const path = require('node:path');

const microFrontendPackageRoots = [
  path.join(__dirname, '..', 'node_modules', '@granite-js', 'plugin-micro-frontend'),
  path.join(
    __dirname,
    '..',
    'node_modules',
    '@apps-in-toss',
    'plugins',
    'node_modules',
    '@granite-js',
    'plugin-micro-frontend'
  ),
];

const compatPackageRoots = [path.join(__dirname, '..', 'node_modules', '@apps-in-toss', 'plugin-compat')];

const microFrontendReplacements = [
  [
    "import * as ${identifier} from '${path.resolve(modulePath)}';",
    'import * as ${identifier} from ${JSON.stringify(path.resolve(modulePath))};',
  ],
  [
    "import * as ${identifier} from '${path.default.resolve(modulePath)}';",
    'import * as ${identifier} from ${JSON.stringify(path.default.resolve(modulePath))};',
  ],
];

const compatReplacements = [
  [
    "const reactUsePolyfill = require('${reactUsePolyfillPath}');",
    'const reactUsePolyfill = require(${JSON.stringify(reactUsePolyfillPath)});',
  ],
  [
    "const reactEffectEventPolyfill = require('${reactEffectEventPolyfillPath}');",
    'const reactEffectEventPolyfill = require(${JSON.stringify(reactEffectEventPolyfillPath)});',
  ],
];

let patched = 0;

function patchFiles(packageRoots, replacements) {
  let patchedFiles = 0;

  for (const packageRoot of packageRoots) {
    for (const fileName of ['index.js', 'index.cjs']) {
      const filePath = path.join(packageRoot, 'dist', fileName);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      const source = fs.readFileSync(filePath, 'utf8');

      const patchedSource = replacements.reduce(
        (nextSource, [before, after]) => nextSource.replace(before, after),
        source
      );

      if (patchedSource === source) {
        continue;
      }

      fs.writeFileSync(filePath, patchedSource, 'utf8');
      patchedFiles += 1;
    }
  }

  return patchedFiles;
}

patched += patchFiles(microFrontendPackageRoots, microFrontendReplacements);
patched += patchFiles(compatPackageRoots, compatReplacements);

if (patched > 0) {
  console.log(`Patched Windows package paths in build plugins (${patched} file(s)).`);
}
