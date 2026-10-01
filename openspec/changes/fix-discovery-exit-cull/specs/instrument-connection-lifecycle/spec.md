# Spec Delta

## MODIFIED Requirements

### Requirement: Discovery and refresh

With `tsp.autorefresh` enabled, the extension SHALL run a refresh cycle when it starts and
again 2 seconds after each cycle finishes. Turning `tsp.autorefresh` off SHALL stop
scheduling cycles; turning it on SHALL start them. With `tsp.autorefresh` disabled, a
Refresh action SHALL be shown in the Instruments view title and SHALL run one cycle. Each
cycle SHALL first update every known connection and then run a discovery pass (2-second
timeout). A connection SHALL be recorded as seen now when discovery reports it, when a
refresh probe returns the instrument's serial number, or when its instrument terminal
closes. Connections reported by discovery SHALL become `Active`. During the update step, a
connection seen within the last 6 seconds SHALL become `Active`; any other connection
SHALL become `Active` if a 1-second probe returns the instrument's serial number and
`Inactive` otherwise. When a discovery pass ends, every connection that has not been seen
within the last 6 seconds and is neither `Connected` nor `Connecting` SHALL become
`Inactive`; connections seen within the last 6 seconds SHALL keep their status.

#### Scenario: Instrument appears on the network

- **WHEN** discovery reports an instrument that was `Inactive`
- **THEN** its reported connection becomes `Active` and the instrument moves out of
  "Offline Instruments"

#### Scenario: Discovered instrument stays listed after the pass

- **WHEN** a discovery pass reports an instrument and then ends
- **THEN** the instrument's reported connection stays `Active` and the instrument stays
  out of "Offline Instruments"

#### Scenario: Stale connection culled when discovery ends

- **WHEN** a discovery pass ends and a connection that is not `Connected` or `Connecting`
  has not been seen for more than 6 seconds
- **THEN** the connection becomes `Inactive`

#### Scenario: Probe-only instrument stays active

- **WHEN** an instrument is never reported by discovery but answers every refresh probe
  with its serial number
- **THEN** its connection stays `Active` across refresh cycles and discovery passes

#### Scenario: Connected connection is not culled

- **WHEN** a discovery pass ends while a connection is `Connected` or `Connecting`,
  regardless of when it was last seen
- **THEN** its status is unchanged

#### Scenario: Recently disconnected instrument

- **WHEN** an instrument's terminal closes and a discovery pass ends before the next
  refresh probe
- **THEN** the connection stays `Active`

#### Scenario: Instrument stops responding

- **WHEN** a connection has not been seen for more than 6 seconds and the probe gets no
  matching serial number
- **THEN** the connection becomes `Inactive`

#### Scenario: Manual refresh

- **WHEN** `tsp.autorefresh` is `false`
- **THEN** a Refresh action is shown in the Instruments view title and runs a single cycle
