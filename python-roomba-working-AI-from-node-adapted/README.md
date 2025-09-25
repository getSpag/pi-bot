# Python Roomba Serial Test

This mirrors the behavior of the Node `serialport` example using Python and `pyserial`.

## Setup

1. Create/activate a virtual environment (optional but recommended).
2. Install dependencies:

```
pip install -r requirements.txt
```

## Run

```
python3 main.py
```

By default this will:
- List available serial ports
- Connect to `/dev/ttyACM0` at 115200 baud (if present; otherwise tries the first available port)
- Send Roomba OI commands to start, switch to SAFE mode, drive forward briefly, then stop and close

You may need appropriate permissions for `/dev/tty*` devices (e.g., add your user to the `dialout` group or use `sudo`).


