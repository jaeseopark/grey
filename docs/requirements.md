# Requirements

## Context

Flatbed scanners often scan images slightly crooked and in RGB colourspace when most documents are greyscale. Users have to open these images in editing software and apply correction & size optimization.

## Goal

Create an in-browser library that can be placed in any web application for post-processing of scanned images.

## Requirements

1. Given a blank div provided by the user with a unique id, initialize the application (ex. `<div id="grey-editor"></div>`) — **done**
1. User should be able to drag and drop local files or use the browse/open mechanism to locate and open files — **done**
1. Tabbed design to allow opening of multiple files at once or folders (or multiple folders) — **done**
1. Support for common image types like jpeg, png, tiff; the most common file types coming out of consumer scanners — **done** (JPEG via MozJPEG WASM; PNG via browser-native APIs; TIFF via UTIF decode/encode)
1. Complete offline access; no talking to remote servers — **done**
1. Concept of 'image canvas' where the bounds define the image dimensions — **done**
1. User should be able to apply arbitrary rotation from -359 deg to +359 deg. When the image is rotated, the app should add appropriate padding to account for the image being wider and taller. Live preview as the rotation parameters are changing — **done**
1. User should be able to apply crop before or after the rotation. Multiple times if they wanted to — **done**
1. User should be able to apply Levels adjustments (black point, white point, and midtones/gamma) with live preview, similar to Photoshop's Levels tool — **done**
1. User can click save or hit cmd(ctrl) + s to start the save process. In the save view, the user should be able to select the file type, compression settings (if any), the colour space (RGB, RGBA, or greyscale), and the scaling factor, defaulted to 1.00 or they can enter the "long edge" parameter in pixels — **partially done**: file type select (JPEG enabled; PNG and TIFF backend-ready but UI-disabled), quality/compression, scale factor, and long-edge inputs are all present; colour space selection is not yet implemented (export currently always converts to greyscale)
1. Upon saving, the app should initiate the download process using the standard download protocol modern browsers work with — **done**
1. Available as a React component via the `grey` npm package; the component carries no default CSS so consumers supply their own stylesheet — **done**
