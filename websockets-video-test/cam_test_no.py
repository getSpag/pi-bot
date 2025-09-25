import depthai as dai

# Get a list of all available OAK devices
available_devices = dai.DeviceBootloader.getAllAvailableDevices()

if not available_devices:
    print("No OAK devices found.")
else:
    print("Found the following OAK devices:")
    for i, device_info in enumerate(available_devices):
        print(f"Device {i+1}:")
        # print(f"  MXID: {device_info.MxId}")
        print(f"  State: {device_info.state}")
        # You can also get other information like IP address for PoE devices
        if device_info.state == dai.XLinkDeviceState.X_LINK_BOOTED or \
           device_info.state == dai.XLinkDeviceState.X_LINK_UNBOOTED:
            # Attempt to connect to the device to get more details if needed
            try:
                with dai.Device(device_info) as device:
                    print(f"  Connected device name: {device.getDeviceName()}")
            except RuntimeError as e:
                print(f"  Could not connect to device for more details: {e}")


# import cv2

# for i in range(5):  # check first 5 devices
#     cap = cv2.VideoCapture(i)
#     if cap.isOpened():
#         ret, frame = cap.read()
#         if ret:
#             print(f"Camera found at index {i}")
#         cap.release()

## ls ~/../../dev/video* lol