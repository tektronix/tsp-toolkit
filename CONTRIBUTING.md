# Contribution Guide

## Dependencies

In order to contribute code to this project you must have the following dependencies installed:

* NodeJS version 20.11.0 or later
* Rust (latest stable version)

### To check

* Check NodeJS is installed and is correct version: `node --version`
    * `node` should show 20.11.x where "x" is any number `>= 0`
* Check that `npm` is installed: `npm --version`
    * `npm` should be present, the version is not as important
* Check Rust version with `rustup --version` or `rustc --version`
    * `rustup` should indicate that the stable Rust compiler is installed

## Getting Started

0. Ensure [all dependencies](#dependencies) are installed
1. Clone this repository locally: `git clone ssh://git@git.keithley.com:2289/trebuchet/teaspoon/teaspoon.git`
2. Change to the root project directory: `cd teaspoon`
3. Install node development dependencies: `npm install --devDependencies`
    * This will trigger a build of the Rust project; the first compilation may take a few minutes to complete.
4. Run tests to ensure everything is set up properly: `npm run test`


To get started, clone this repository. Then run `npm install --devDependencies`.

You will be prompted about the location of any local ki-comms projects. If you are not developing ki-comms, just hit <kbd>Enter</kbd>. This will automatically install the dependency from the Keithley GitLab.

## Certificates Setup

Tektronix uses self-signed certificates. This makes life difficult when using standard tooling like `npm`. In order to use the GitLab npm package registry, you'll need to tell npm that those self-signed certificates are safe. `npm` annoyingly doesn't use your system's installed CA certs, so we have to add to the accepted ones.

1. Download the [ca-certs](https://git.keithley.com/devops/certificates/-/jobs/artifacts/main/download?job=package) from the devops/certificates project (link will start download).
2. Extract and put them somewhere (I personally like `~/.certs/Tektronix_*.crt`)
3. Add NODE_EXTRA_CA_CERTS to your environment variables with the full path to the `Tektronix_Global.gitlab.chain1.crt` file


## Developing `ki-comms` Concurrently

If developing on both the Rust terminal binary and the TypeScript extension, be sure to perform the following steps:

### Setup ki-comms

<details>
<summary>Steps for Linux</summary>

```bash
# Clone ki-comms
$ git clone ssh://git@git.keithley.com:2289/trebuchet/teaspoon/ki-comms.git
$ cd ki-comms
$ mkdir -p bin

# for debugging
$ cargo build
$ cp target/debug/kic bin/

# for release
$ cargo build --release
$ cp target/release/kic bin/

# clean up old node modules in teaspoon
# (only if using an old clone of teaspoon)
$ cd ../path/to/teaspoon
$ rm -rf node_modules
```
</details>

<details>
<summary>Steps for Windows</summary>

```ps1
# Clone ki-comms
$ git clone ssh://git@git.keithley.com:2289/trebuchet/teaspoon/ki-comms.git
$ cd ki-comms
$ mkdir bin

# for debugging
$ cargo build
$ cp target/debug/kic.exe bin/

# for release
$ cargo build --release
$ cp target/release/kic.exe bin/

# clean up old node modules in teaspoon
# (only if using an old clone of teaspoon)
$ cd ../path/to/teaspoon
$ rm -r -fo node_modules
```
### Setting up your Personal Access Token (PAT)

Make sure you have [set up the certificates](#certificates-setup) and have [set up a Personal Access Token](https://git.keithley.com/-/profile/personal_access_tokens?name=NPM+Access+Token&scopes=api,read_user,read_registry,read_repository) (keep track of that token, you'll need to generate a new one if you lose it).

This can be installed by running

```bash
$ npm config set @trebuchet:registry https://git.keithley.com/api/v4/packages/npm/
$ npm config set -- '//git.keithley.com/api/v4/packages/npm/:_authToken' "<your_token>"
```
</details>


## Code Quality

**TODO**

## Testing

**TODO**

## Contributing/Submitting Changes

**TODO**

