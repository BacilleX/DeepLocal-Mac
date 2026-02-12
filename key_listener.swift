import Cocoa
import Darwin // For fflush

// Standard Output for communication with Electron
let stdout = FileHandle.standardOutput

// Helper to print to stdout (flushed immediately)
func log(_ message: String) {
    if let data = (message + "\n").data(using: .utf8) {
        stdout.write(data)
        fflush(__stdoutp) // Force flush
    }
}

// Event Tap Callback
func eventCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    // Check for Command + C
    if type == .keyDown {
        let flags = event.flags
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        
        // KeyCode 8 is 'C' (ANSI & ISO)
        if keyCode == 8 && flags.contains(.maskCommand) {
            log("CMD_C")
        }
    }
    return Unmanaged.passUnretained(event)
}

// Create Event Tap
let eventMask = (1 << CGEventType.keyDown.rawValue)
guard let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly, // Non-blocking!
    eventsOfInterest: CGEventMask(eventMask),
    callback: eventCallback,
    userInfo: nil
) else {
    log("failed to create event tap")
    exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

log("started")
CFRunLoopRun()
