import RPi.GPIO as GPIO
import time

# Set the GPIO mode (BCM or BOARD)
GPIO.setmode(GPIO.BCM)

# Choose a GPIO pin for PWM
pwm_pin = 18 

# Setup the chosen pin as an output
GPIO.setup(pwm_pin, GPIO.OUT)

# Create a PWM object with the pin and frequency (Hz)
pwm = GPIO.PWM(pwm_pin, 100) # 100 Hz frequency

# Start PWM with an initial duty cycle (0-100)
pwm.start(50) # 50% duty cycle

try:
    while True:
        # Change duty cycle
        print("hi")
        for dc in range(0, 101, 5):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.1)
        for dc in range(100, -1, -5):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.1)

except KeyboardInterrupt:
    # Stop PWM and clean up GPIO on exit
    pwm.stop()
    GPIO.cleanup()