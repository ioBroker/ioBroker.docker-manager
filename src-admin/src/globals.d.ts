/// <reference types="vite/client" />
// vite/client declares the side-effect modules for assets and stylesheets
// (*.css, *.svg, *.png, *.jpg, ...), so they must not be re-declared here.

// Allow `color="grey"` on MUI buttons - the grey entry is added to the palette by the ioBroker theme.
declare module '@mui/material/Button' {
    interface ButtonPropsColorOverrides {
        grey: true;
    }
}

export {};
