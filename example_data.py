main_subnet = "192.168.0.0/16"
map_title = "EXAMPLE OUTPUT MAP"

subnet_groups = [
    {
        "title": "Core",
        "comment": "Main\nServices",
        "show_full": False,
        "color": "blue",  # Using color name
        "subnets": [
            "192.168.4.0/23",
            "192.168.16.0/22",
            "192.168.20.0/24",
        ]
    },
    {
        "title": "Secondary",
        "comment": "Secondary\nServices",
        "show_full": False,
        "color": "green",  # Using color name
        "subnets": [
            "192.168.21.0/24",
            "192.168.22.0/23",
            "192.168.24.0/19",
        ]
    },

    {
        "title": "DMZ",
        "comment": "Public-Facing Services",
        "show_full": False,
        "color": "orange",  # Using color name
        "subnets": [
            "192.168.0.0/22",
        ]
    },
    {
        "title": "User VLANs",
        "comment": "Employee Workstations",
        "show_full": False,
        "subnets": [
            "192.168.56.0/21",
        ]
    },
    {
        "title": "Guest/IoT",
        "comment": "Guest WiFi & IoT Devices",
        "show_full": False,
        "subnets": [
            "192.168.64.0/20",
        ]
    },
    {
        "title": "Branch A",
        "comment": "",
        "show_full": False,
        "subnets": [
            "192.168.80.0/20",
        ]
    },
    {
        "title": "Branch B",
        "comment": "",
        "show_full": False,
        "subnets": [
            "192.168.100.0/20",
        ]
    },
    {
        "title": "Branch C",
        "comment": "",
        "show_full": False,
        "subnets": [
            "192.168.116.0/22",
        ]
    },
    {
        "title": "Branch D",
        "comment": "",
        "show_full": False,
        "subnets": [
            "192.168.120.0/22",
        ]
    },
    {
        "title": "VPN",
        "comment": "Remote Access VPN Pool",
        "show_full": False,
        "subnets": [
            "192.168.124.0/22",
        ]
    },
    {
        "title": "Lab/Dev",
        "comment": "Development & Testing",
        "show_full": False,
        "color": "#c2c2f0",  # Using hex code directly
        "subnets": [
            "192.168.128.0/17",
        ]
    },
]
