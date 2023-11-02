# `teaspoon` Release Process

## Dependencies

`teaspoon` has several dependencies, be sure to follow the `RELEASE.md` document in each of those projects before following the rest of this process.

* `ki-comms`
* `keithley_instrument_libraries` (project: jsonToLuaParser)
* `tsp-2600series-web-help-documents`

## Process

### 1. Pull Latest

On your development machine, pull the latest `dev` and `main` branches

```bash
# Development Machine
git switch dev
git pull
git switch main
git pull
```

### 2. Create Release Branch from `main`

On your development machine, create a release branch off of main

```bash
# Development Machine
git switch main
git switch -c release/vX.Y.Z
```

### 3. Merge `dev` to New Release Branch

Merge `dev` into the new release branch, handling any merge conflicts.

```bash
# Development Machine
git switch release/vX.Y.Z
git merge dev
```

If there are conflicts on the `package-lock.json` file, simply delete it and run
`npm install --devDependencies`.

Commit the fully-resolved merge with the default merge commit message.

### 4. Update the `CHANGELOG.md` File

Change the "Unreleased" section to the current version number, with the link to the
release underneath (see all previous versions for examples).

```diff
-## [Unreleased]
+<!--## [Unreleased] -->
+## [vX.Y.Z]
+[vX.Y.Z Release Page]
```

Be sure to add the associated links at the bottom of the file underneath the "Unreleased" reference:

```diff
[Unreleased]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/tree/dev
+[vX.Y.Z]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/compare/v(X.Y.Z - 1)...vX.Y.Z?from_project_id=33
+[vX.Y.Z Release Page]: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases/vX.Y.Z
```
(Where `v(X.Y.Z - 1)` is the previous released version)

Be sure to check the merge requests for this past version to make sure everything was added to the changelog. Add anything that was missed (with JIRA issue number).

You can do that with a query like the one at this link: https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/merge_requests?scope=all&state=merged&deployed_after=03%2F29%2F2023&deployed_before=04%2F14%2F2023

### 5. Update the Version Information

Update the `package.json` version numbers:

> **package.json**
> ```diff
> -    "version": "0.6.0",
> +    "version": "X.Y.Z",
> ```

Update the version number of all dependencies:

> **package.json**
> ```diff
> -        "@trebuchet/tsp-2600series-web-help-documents": "^0.6.0",
> -        "@trebuchet/keithley_instrument_libraries": "^0.6.0",
> -        "@trebuchet/ki-comms": "^0.6.0",
> +        "@trebuchet/tsp-2600series-web-help-documents": "^X.Y.Z",
> +        "@trebuchet/keithley_instrument_libraries": "^X.Y.Z",
> +        "@trebuchet/ki-comms": "^X.Y.Z",
> ```

After updating these files, make sure to update the lock files

```bash
# Development Machine
npm install --devDependencies
```

Commit the CHANGELOG.md and package version changes in a single commit with something similar to:

```
Update Version Numbers
```

### 5. Create Merge Requests

Push the release branch to GitLab:

```bash
git push -u origin release/vX.Y.Z
```

#### Create a merge request from the `release/vX.Y.Z` branch into `main` with the following details:

> * From `release/vX.Y.Z` into `main` (you will need to "Change branches" for this, as it defaults to `dev`)
> * **Title:** Release vX.Y.Z
> * **Description:** Delete template text and insert "Internal vX.Y.Z Release"
> * **Assignee:** Yourself
> * **Reviewer:** Pick someone
> * **Milestone:** Select the appropriate milestone (vX.Y.Z)
> * **Labels:** Add "Release"
> * **Merge Options**
>     - Select **ONLY** "Squash commits when merge request is accepted"


#### Create a merge request from the `release/vX.Y.Z` branch into `dev` with the following details:

> * From `release/vX.Y.Z` into `dev`
> * **Title:** Release vX.Y.Z into dev
> * **Description:** Delete template text and insert "Internal vX.Y.Z Release into dev"
> * **Assignee:** Yourself
> * **Reviewer:** Pick someone
> * **Milestone:** Select the appropriate milestone (vX.Y.Z)
> * **Labels:** Add "Release: Dev"
> * **Merge Options**
>     - Select **ONLY** "Delete source branch when merge request is accepted"

### 6. Complete Merge into `main` FIRST

Complete the merge into the `main` branch.


### 7. Tag `main` with `vX.Y.Z`

Create a [tag](https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/tags) for the new version.
> * **Tag Name:** `vX.Y.Z`
> * **Create from:** `main` (This is NOT default, make sure to change it)
> * **Message:** Internal vX.Y.Z Release

Wait for the automatically started [pipeline](https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/pipelines) to complete.

### 8. Verify Release

Check the following to ensure that the release completed successfully:

* [Releases page](https://git.keithley.com/trebuchet/teaspoon/teaspoon/-/releases) should show `vX.Y.Z`

### 9. Update Release Notes

The release notes will have "TBD" in the "Added Features" and "Known Issues" sections. Copy all the sections from the CHANGELOG.md file for the current version release and past them into the "Added Features" section. List any known issues in the "Known Issues" section.

### 10. Complete Merge into `dev`

This will delete the `release/vX.Y.Z` branch.

