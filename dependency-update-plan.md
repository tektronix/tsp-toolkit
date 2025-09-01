# TSP-Toolkit Dependency Update Plan

## Current Issues

The project has several deprecated dependencies that need updating:

1. ESLint and related packages
2. glob and rimraf packages 
3. Various other npm dependencies

## Update Strategy

### Step 1: Revert to Working State

First, ensure we're at a clean state:

```bash
npm ci
```

### Step 2: Update devDependencies

Update development dependencies with the following command:

```bash
# Create a new branch for dependency updates
git checkout -b update-dependencies

# Update ESLint ecosystem
npm uninstall eslint eslint-config-prettier eslint-plugin-import eslint-plugin-jsdoc eslint-plugin-prettier
npm install --save-dev eslint@latest eslint-config-prettier@latest eslint-plugin-import@latest eslint-plugin-jsdoc@latest eslint-plugin-prettier@latest @eslint/config-array @eslint/object-schema

# Update other dev dependencies
npm install --save-dev rimraf@latest glob@latest
npm install --save-dev @npmcli/fs@latest
npm install --save-dev mocha@latest typescript@latest ts-node@latest

# Update remaining dev dependencies
npm update --save-dev
```

### Step 3: Update Production Dependencies

```bash
# Update main dependencies
npm update --save

# Check for specific updates needed
npm outdated
```

### Step 4: Test the Application

After updating dependencies:

1. Run the build process: `npm run compile`
2. Run tests: `npm test`
3. Start the extension and verify functionality

### Step 5: Handling Breaking Changes

If you encounter breaking changes:

1. Check the migration guides for the updated packages
2. Make necessary code changes to accommodate new API requirements
3. Consider updating dependencies one at a time if there are major issues

### Step 6: Update package.json

Once all dependencies are updated and working:

1. Update the version ranges in package.json to use caret (^) for minor updates
2. Make sure any explicit version constraints are only used when necessary

## Common Patterns to Replace

### Replace deprecated modules:

- `readdir-scoped-modules` → `@npmcli/fs`
- `rimraf` → Latest version (v4+)
- `glob` → Latest version (v9+) 
- `@humanwhocodes/config-array` → `@eslint/config-array`
- `@humanwhocodes/object-schema` → `@eslint/object-schema`

## Notes

- Some dependencies may be transitive (dependencies of your dependencies)
- Using `--legacy-peer-deps` may be needed temporarily but is not a permanent solution
- Consider setting up a regular dependency update schedule to avoid accumulated technical debt
