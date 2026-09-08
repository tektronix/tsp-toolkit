# Generate a Python Wrapper

TSP Toolkit can convert a `.tsp` script into a Python wrapper class. The wrapper loads the same TSP script onto the instrument and exposes its public functions and supported global variables to your Python application.

## How to generate the Python wrapper

Use any of the following entry points:

1. **Editor toolbar** — Open a `.tsp` file and click the Python icon in the editor title bar.
2. **Right-click menu** — Right-click inside a `.tsp` file, on its editor tab, or on the file in the Explorer, and choose **Generate Python Wrapper from a TSP Script**.
3. **Command Palette** — Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS), search for
   **TSP: Generate Python Wrapper from a TSP Script**, and run it. If no file is right-clicked, the command uses the currently active `.tsp` editor.

The generated `.py` file is written next to the source script (`script.tsp` → `script.py`) and opened automatically in a new editor tab beside the original.

## Use the wrapper

Given this TSP script:

```lua
function measure_voltage()
    return smua.measure.v()
end

voltage = 5.0
```

Use the generated wrapper with an instrument object that supplies `write` and `read` methods:

```python
from my_measurements import MyMeasurements

# `instrument` is your existing instrument communication object.
measurements = MyMeasurements(
    instrument,
    instrument.write,
    instrument.read,
    parent_loadscript=None,
)

reading = measurements.measure_voltage()
voltage = measurements.get_voltage()
measurements.set_voltage(10.0)
```

The wrapper loads the TSP source on first use. It avoids loading it again when the copy on the instrument has the same checksum. You may pass a `parent_loadscript` function when your instrument library already provides the script-loading operation.

Function calls and global reads return the raw response received from the instrument. Convert the value in your application when a Python numeric or other type is required.

## What is converted

* Top-level TSP functions become Python instance methods with matching parameters.
* Top-level globals assigned literal numbers, strings, booleans, `nil`, or tables receive `get_<name>()` and `set_<name>(value)` methods.
* TSP code remains the source of instrument behavior; the wrapper does not translate or run the function body in Python.

## Diagnostics and limitations

TSP Toolkit adds conversion diagnostics to the VS Code **Problems** panel for the source TSP file. Syntax errors prevent output from being generated. Warnings allow partial output, but the affected element is omitted from the wrapper.

The converter does not expose local or nested functions, member-function declarations such as `function smua.measure()`, functions using varargs (`...`), or globals assigned complex expressions such as function-call results. Refactor the desired API into a top-level function or use a literal global assignment, then generate the wrapper again.