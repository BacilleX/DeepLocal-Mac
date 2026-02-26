const { app, BrowserWindow } = require('electron');
const fs = require('fs');

app.whenReady().then(() => {
    let win = new BrowserWindow({width: 44, height: 44, show: false, transparent: true, frame: false});
    win.loadURL('data:text/html,' + encodeURIComponent(`
        <html><body style="margin:0;overflow:hidden;background:transparent;">
            <canvas id="c" width="44" height="44"></canvas>
            <script>
                const ctx = document.getElementById('c').getContext('2d');
                ctx.clearRect(0,0,44,44);
                ctx.strokeStyle = '#000000'; // black for macOS Template
                ctx.lineWidth = 3;
                
                // First circle
                ctx.beginPath();
                ctx.arc(16, 22, 10, 0, 2*Math.PI);
                ctx.stroke();
                
                // Second circle
                ctx.beginPath();
                ctx.arc(28, 22, 10, 0, 2*Math.PI);
                ctx.stroke();
            </script>
        </body></html>
    `));
    
    win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
            try {
                const img = await win.webContents.capturePage();
                fs.writeFileSync('public/tray-iconTemplate.png', img.toPNG());
                fs.writeFileSync('public/tray-iconTemplate@2x.png', img.toPNG());
                
                // Also create generic normal versions just in case
                fs.writeFileSync('dist/tray-iconTemplate.png', img.toPNG());
                fs.writeFileSync('dist/tray-iconTemplate@2x.png', img.toPNG());
                
                console.log("OK_TRAY_GENERATED");
            } catch (e) {
                console.error("Error capturing page", e);
            }
            app.quit();
        }, 1000);
    });
});
