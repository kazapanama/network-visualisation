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

def draw_network_diagram(main_cidr, subnets_cidrs, output_file="subnet_map.png"):
    main_net = parse_network(main_cidr)
    if not main_net:
        return

    subnets = []
    for s in subnets_cidrs:
        net = parse_network(s)
        if net:
            # Check if subnet is actually within main network
            if not net.subnet_of(main_net):
                print(f"Warning: {s} is not a subnet of {main_cidr}. Skipping.")
                continue
            subnets.append(net)

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
    
    # Format X axis to show IP addresses instead of huge integers
    # We'll pick a few points to label
    ticks = [start_ip_int, end_ip_int]
    tick_labels = [str(main_net.network_address), str(main_net.broadcast_address)]
    
    # Add some intermediate ticks if needed, but for now start/end is good for the main bar
    ax.set_xticks(ticks)
    ax.set_xticklabels(tick_labels, rotation=45, ha='right')

    # Draw Main Network (Base Line/Bar)
    # Let's draw it as a big rectangle at the bottom
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
    # We'll draw them on a "layer" above the main network
    # To avoid overlapping text, we might need to stagger heights or just rely on visual separation
    
    # Sort subnets by address to draw them in order
    subnets.sort(key=lambda x: x.network_address)
    
    colors = ['#ff9999', '#66b3ff', '#99ff99', '#ffcc99', '#c2c2f0', '#ffb3e6']
    
    for i, subnet in enumerate(subnets):
        s_start = ip_to_int(subnet.network_address)
        s_end = ip_to_int(subnet.broadcast_address)
        s_width = s_end - s_start
        
        # Cycle colors
        color = colors[i % len(colors)]
        
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
        # If the subnet is too small, the text might be messy. 
        # We'll try to put text in the center of the block.
        label_text = str(subnet)
        ax.text(
            s_start + s_width/2, 
            3, 
            label_text, 
            ha='center', 
            va='center', 
            fontsize=9, 
            rotation=90 if s_width < total_hosts * 0.05 else 0 # Rotate if very narrow
        )

    plt.title(f"Subnet Visualization for {main_cidr}")
    plt.tight_layout()
    
    print(f"Saving visualization to {output_file}...")
    plt.savefig(output_file)
    print("Done.")

if __name__ == "__main__":
    # Example Usage
    # You can modify these lists to test different configurations
    main = "192.168.0.0/16"
    

    subs = [
        "192.168.0.0/19",
        # "192.168.32.0/19",
        "192.168.64.0/19", 
        "192.168.96.0/19",
        "192.168.160.0/17",
        "192.168.172.0/17",
        "192.168.184.0/17",
        "192.168.200.0/25"
    ]
    
    draw_network_diagram(main, subs)
