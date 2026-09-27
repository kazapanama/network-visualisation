# Colors for subnet groups. Kept separate from visualizer.py so the editor can
# read them without importing matplotlib.

# Available colors for subnet groups
COLORS = {
    'red': '#ff9999',
    'blue': '#66b3ff',
    'light_blue': '#b3e0ff',
    'dark_blue': '#4d94ff',
    'green': '#99ff99',
    'orange': '#ffcc99',
    'purple': '#c2c2f0',
    'pink': '#ffb3e6',
}

# Default color cycle (for groups without explicit color)
DEFAULT_COLORS = list(COLORS.values())
