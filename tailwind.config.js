/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
    extend: {
    colors: {
    brand: {
    50: '#f5f7ff', 100:'#e9edff', 200:'#cfd7ff', 300:'#a6b4ff', 400:'#7b8cff', 500:'#5468ff', 600:'#394bdb', 700:'#2d3aa8', 800:'#232f84', 900:'#1f2a6c'
    }
    }
    },
    },
    plugins: [],
    }