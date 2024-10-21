# Pixel editor

WebXDC editor for 1-bit pixel graphics.

This is a sample app demonstrating synchronization of pixel array using
Last-Write-Wins conflict resolution.

Each participant can toggle pixels on and off, which results in sending an
update for the pixel to other participants.

[Online-Demo](https://webxdc.codeberg.page/pixel/@main/)

## Development

To run this WebXDC app in the emulator, simply open `index.html` in the browser.

To create an `.xdc` file that can be sent into the chat, execute
`./create-xdc.sh`.
