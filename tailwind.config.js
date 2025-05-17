module.exports = {
    darkMode: false, // or remove this if not needed
    content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                background: 'var(--color-background)',
                foreground: 'var(--color-foreground)',
            },
            fontFamily: {
                sans: ['var(--font-sans)'],
                mono: ['var(--font-mono)'],
            },
        },
    },
    plugins: [],
}
