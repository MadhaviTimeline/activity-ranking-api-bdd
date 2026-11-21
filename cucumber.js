// Cucumber profiles. `default` excludes @live so the normal run is fully offline.
const common = {
  paths: ['features/**/*.feature'],
  requireModule: ['tsx/cjs'],
  require: ['src/support/**/*.ts', 'src/steps/**/*.ts'],
  format: [
    'progress-bar',
    'html:reports/cucumber-report.html',
    'json:reports/cucumber-report.json',
  ],
  formatOptions: { snippetInterface: 'async-await' },
};

module.exports = {
  default: { ...common, tags: 'not @live' },
  smoke: { ...common, tags: '@smoke and not @live' },
  live: { ...common, tags: '@live' },
};
