# Adding Third-Party Components

When adding new third-party code, place all code from that party into its own directory alongside a separate "LICENSE" and "README.md" file.

The LICENSE file must be an exact copy of the third-party's applicable LICENSE file.

The README file must contain a hyperlink to the source and commit as applicable. The hyperlink may be a link directly to the commit the component was copied from in that third-party's repository.

For example, if you needed to add a component from Tektronix's [Syphon](https://github.com/tektronix/syphon) repo from commit [147c48e](https://github.com/tektronix/syphon/tree/147c48ecd91b00d372631b61eec9e69886e19af5) and weren't able to add it as an NPM or Cargo dependency, then you'd create the following:
```text
third-party/
    syphon/
        component.file
        LICENSE
        README.md
```
In this example
* `component.file` is whatever component you've copied from the repo,
* `LICENSE` is copied exactly as it appears in said commit's [LICENSE](https://github.com/tektronix/syphon/blob/147c48ecd91b00d372631b61eec9e69886e19af5/LICENSE) file,
* and contents of `README.md` are as follows
  ```markdown
  # Syphon

  This directory contains components copied from Tektronix's Syphon repository as it appears in commit
  [147c48ecd91b00d372631b61eec9e69886e19af5](https://github.com/tektronix/syphon/tree/147c48ecd91b00d372631b61eec9e69886e19af5).

  # License

  <!-- The copyright as it appears in the LICENSE. -->
  Copyright Tektronix Inc.

  Licensed under the [MIT](./LICENSE) license.
  ```

# Adding Integrated Third-Party Components

Sometimes third-party components must be located alongside first-party code. There are very particular legal requirements for which licenses are acceptable in this scenario. The remainder of these instructions assume you've done your due diligence.

All integrated third-party components must include the following information in a header comment:
1. a hyperlink to the source and commit as applicable,
1. notice of any alterations,
1. and the original license in full.

If you perform any alterations, you may update the copyright information of the included original license if permitted by said license.

The below example is the header from [Tsp.g4](https://github.com/tektronix/vscode-tsplang/blob/96bbfb247818332e8f53135e2cb2c96cab47c915/server/@antlr4-tsplang/Tsp.g4) as it appears in Tektronix's [vscode-tsplang](https://github.com/tektronix/vscode-tsplang) repository in commit [96bbfb247818332e8f53135e2cb2c96cab47c915](https://github.com/tektronix/vscode-tsplang/tree/96bbfb247818332e8f53135e2cb2c96cab47c915).

```c
/*
 * This grammar file is adapted by Tektronix from Lua.g4 at commit
 *      dbe02c840ffd07197e62e51926f49cb130819179
 * available at https://github.com/antlr/grammars-v4/tree/dbe02c840ffd07197e62e51926f49cb130819179/lua.
 *
 * Except as otherwise noted, the content of this file is licensed under the
 * BSD-3-Clause license. The text of the BSD-3-Clause license is reproduced
 * below.
 *
 * ----------------------------------------------------------------------------
 *
 * Copyright (c) 2013, Kazunori Sakamoto
 * Copyright (c) 2016, Alexander Alexeev
 * Copyright (c) 2018, Tektronix Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the NAME of Rainer Schuster nor the NAMEs of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * The left-recursion of prefixexp in the Lua 5.0 grammar was removed thanks
 * to the following post:
 *      http://lua-users.org/lists/lua-l/2010-12/msg00699.html
 */
```
