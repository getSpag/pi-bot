import sys
import time
from typing import Optional, List

try:
    import serial  # type: ignore
    import serial.tools.list_ports  # type: ignore
except Exception as exc:  # pragma: no cover
    print("pyserial is required. Install with: pip install -r requirements.txt", file=sys.stderr)
    raise


def list_serial_ports() -> List[str]:
    ports = serial.tools.list_ports.comports()
    return [p.device for p in ports]


def pick_port(preferred_path: str = "/dev/ttyACM0") -> Optional[str]:
    available = list_serial_ports()
    print("Available ports:")
    for p in available:
        print(p)
    if preferred_path in available:
        return preferred_path
    return available[0] if available else None


def write_bytes(ser: serial.Serial, values: List[int]) -> None:
    ser.write(bytes(values))
    ser.flush()


def main() -> None:
    port_path = pick_port("/dev/ttyACM0")
    if not port_path:
        print("No serial ports found.", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to {port_path} @ 115200...")
    with serial.Serial(port=port_path, baudrate=115200, timeout=1) as ser:
        print("Connected to Roomba")

        # Start (Roomba OI: Start = 128)
        write_bytes(ser, [128])

        time.sleep(0.1)

        # Safe mode (131). For Full mode, use 132
        write_bytes(ser, [131])

        time.sleep(0.1)

        # Drive command (137) with velocity and radius
        # Matches Node example: [137, 0, 100, 0, 0]
        write_bytes(ser, [137, 0, 100, 0, 0])

        # Run for 2 seconds
        time.sleep(2.0)

        # Stop teh roomba 
        write_bytes(ser, [137, 0, 0, 0, 0])

        # write the stop comand
        # print(write_code(173, ser))
        write_bytes(ser, [173])

    print("Disconnected")


if __name__ == "__main__":
    main()


