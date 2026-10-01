# Spec Delta

## MODIFIED Requirements

### Requirement: Capturing TSP output

Start saving TSP output SHALL ask for an output file with a save dialog titled "Select
Output File" and send `.save --tsp --output "<output>"`, connecting first if needed. The
instrument SHALL be marked `Saving` only once that command has been sent. If the flow ends
before then (the connection quick pick is dismissed, the save dialog is cancelled, or the
connection fails), nothing SHALL be sent and the `Saving` mark SHALL stay as it was before
the flow started. Stop saving TSP output SHALL clear the `Saving` mark and send
`.save --end` to the connected terminal, and send nothing if there is no terminal. Starting
a new connection attempt SHALL clear the `Saving` mark (see
`instrument-connection-lifecycle`).

#### Scenario: Start and stop capture

- **WHEN** the user starts saving TSP output to `log.txt` on a connected instrument and
  later stops it
- **THEN** `.save --tsp --output "<path>/log.txt"` is sent, the instrument is marked
  `Saving`, then `.save --end` is sent and the mark is cleared

#### Scenario: Output file not chosen

- **WHEN** the user starts saving TSP output and cancels the save dialog
- **THEN** no command is sent and the instrument is not marked `Saving`

#### Scenario: Connection picker dismissed

- **WHEN** the instrument has no `Connected` connection, the user starts saving TSP
  output, and dismisses the "Which connection?" quick pick
- **THEN** no command is sent and the instrument is not marked `Saving`
