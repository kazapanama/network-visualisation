import ipaddress
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import sys

def parse_network(cidr):
    try:
        return ipaddress.ip_network(cidr, strict=False)
    except ValueError as e:
        print(f"Error parsing network {cidr}: {e}")
        return None

def ip_to_int(ip):
    return int(ip)

def draw_network_diagram(main_cidr, subnet_groups, output_file="subnet_map.png"):
    main_net = parse_network(main_cidr)
    if not main_net:
        return

    # Parse all subnets and store with metadata
    parsed_subnets = []
    for group_idx, group in enumerate(subnet_groups):
        title = group.get('title', f"Group {group_idx+1}")
        cidrs = group.get('subnets', [])
        
        for cidr in cidrs:
            net = parse_network(cidr)
            if net:
                if not net.subnet_of(main_net):
                    print(f"Warning: {cidr} is not a subnet of {main_cidr}. Skipping.")
                    continue
                parsed_subnets.append({
                    'net': net,
                    'title': title,
                    'group_idx': group_idx
                })

    # Setup plot
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Define X axis limits based on main network
    start_ip_int = ip_to_int(main_net.network_address)
    end_ip_int = ip_to_int(main_net.broadcast_address)
    total_hosts = end_ip_int - start_ip_int
    
    ax.set_xlim(start_ip_int, end_ip_int)
    ax.set_ylim(0, 5) # Arbitrary Y height
    
    # Hide Y axis
    ax.get_yaxis().set_visible(False)
    
    # Format X axis
    ticks = [start_ip_int, end_ip_int]
    tick_labels = [str(main_net.network_address), str(main_net.broadcast_address)]
    
    ax.set_xticks(ticks)
    ax.set_xticklabels(tick_labels, rotation=45, ha='right')

    # Draw Main Network (Base Line/Bar)
    main_rect = patches.Rectangle(
        (start_ip_int, 1), 
        total_hosts, 
        1, 
        linewidth=1, 
        edgecolor='black', 
        facecolor='none',
        label=str(main_net)
    )
    ax.add_patch(main_rect)
    
    # Label the main network
    ax.text(
        start_ip_int + total_hosts/2, 
        1.5, 
        f"Main Network: {main_net}", 
        ha='center', 
        va='center', 
        fontsize=12, 
        fontweight='bold'
    )

    # Draw Subnets
    # Sort subnets by address
    parsed_subnets.sort(key=lambda x: x['net'].network_address)
    
    colors = ['#ff9999', '#66b3ff', '#99ff99', '#ffcc99', '#c2c2f0', '#ffb3e6']
    
    for i, item in enumerate(parsed_subnets):
        subnet = item['net']
        title = item['title']
        group_idx = item['group_idx']
        
        s_start = ip_to_int(subnet.network_address)
        s_end = ip_to_int(subnet.broadcast_address)
        s_width = s_end - s_start
        
        # Color based on group
        color = colors[group_idx % len(colors)]
        
        # Draw rectangle
        rect = patches.Rectangle(
            (s_start, 2.5), 
            s_width, 
            1, 
            linewidth=1, 
            edgecolor='black', 
            facecolor=color
        )
        ax.add_patch(rect)
        
        # Label
        label_text = f"{title}\n{subnet}"
        ax.text(
            s_start + s_width/2, 
            3, 
            label_text, 
            ha='center', 
            va='center', 
            fontsize=8, 
            rotation=90 if s_width < total_hosts * 0.08 else 0
        )

    plt.title(f"Subnet Visualization for {main_cidr}")
    plt.tight_layout()
    
    print(f"Saving visualization to {output_file}...")
    plt.savefig(output_file)
    print("Done.")

if __name__ == "__main__":
    # Example Usage
    main = "192.168.0.0/16"
    
    subnet_groups = [
        {
            "title": "Office A",
            "subnets": [
                "192.168.0.0/19",
                "192.168.64.0/19"
            ]
        },
        {
            "title": "Data Center",
            "subnets": [
                "192.168.96.0/19",
                "192.168.160.0/17"
            ]
        },
        {
            "title": "Guest WiFi",
            "subnets": [
                "192.168.172.0/17", # Note: This overlaps with 160.0/17 if not careful, but assuming valid non-overlapping for now or just visualizing inputs
                "192.168.200.0/25"
            ]
        }
    ]
    
    draw_network_diagram(main, subnet_groups)
