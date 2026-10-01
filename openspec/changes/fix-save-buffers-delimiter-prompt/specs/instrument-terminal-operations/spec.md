# Spec Delta

## MODIFIED Requirements

### Requirement: Saving buffers to a file

Save buffers to a file SHALL prompt in this order: buffer variable names (comma-separated,
each trimmed), a delimiter (empty input means `,`), at least one field to print from
`absolute_timestamps`, `relative_timestamps`, `readings`, `measurefunctions`,
`measureranges`, `sourcefunctions`, `sourceoutputstates`, `sourceranges`, `sourcevalues`,
and `statuses`, and an output file. It SHALL then send `.save --buffer "<b1>" --buffer
"<b2>" … --format "<field1>,<field2>,…" --delimiter "<delimiter>" --output "<output>"`,
connecting first if needed. Dismissing the buffer prompt or the delimiter prompt, selecting
no fields, or cancelling the output dialog SHALL end the flow without sending anything.

#### Scenario: Two buffers, two fields

- **WHEN** the user enters `defbuffer1, buf2`, accepts the delimiter prompt empty, picks
  `readings` and `relative_timestamps`, and chooses `data.csv`
- **THEN** `.save --buffer "defbuffer1" --buffer "buf2" --format
  "readings,relative_timestamps" --delimiter "," --output "<path>/data.csv"` is sent

#### Scenario: Custom delimiter

- **WHEN** the user enters `;` at the delimiter prompt and completes the other prompts
- **THEN** the command sent includes `--delimiter ";"`

#### Scenario: Delimiter prompt dismissed

- **WHEN** the user presses Escape at the delimiter prompt
- **THEN** no further prompts are shown and nothing is sent

#### Scenario: No fields selected

- **WHEN** the user accepts the fields prompt with nothing selected
- **THEN** nothing is sent
