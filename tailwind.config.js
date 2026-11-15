/** Tailwind CSS v3 config: scans the HUD markup and the classes main.js toggles at runtime. */
module.exports = {
    content: ['./index.html', './js/**/*.js', '!./js/vendor/**'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Segoe UI"', 'Inter', 'system-ui', '-apple-system', 'sans-serif']
            }
        }
    },
    plugins: []
};
