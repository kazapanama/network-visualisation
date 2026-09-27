import ipaddress
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import sys
import argparse
import importlib.util
import os


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


def parse_network(cidr):
    try:
        return ipaddress.ip_network(cidr, strict=False)
    except ValueError as e:
        print(f"Error parsing network {cidr}: {e}")
        return None

def ip_to_int(ip):
    return int(ip)

def get_third_octet(ip_int):
    # ip_int is a 32-bit integer.
    # 3rd octet corresponds to bits 8-15 (0-indexed from right, so actually 8-15 shifted right).
    # IPv4: A.B.C.D -> (A<<24) + (B<<16) + (C<<8) + D
    # We want C.
    return (ip_int >> 8) & 0xFF

def spread_positions(positions, min_gap, lo, hi):
    # Push sorted 1-D positions apart so neighbours are at least min_gap apart,
    # moving each one as little as possible and keeping them within [lo, hi].
    # Overlapping labels are merged into clusters; a cluster is laid out with
    # exact min_gap spacing and centered on the targets of its members.
    def cluster_start(cluster):
        start = sum(t - k * min_gap for k, t in enumerate(cluster)) / len(cluster)
        return min(max(start, lo), hi - (len(cluster) - 1) * min_gap)

    clusters = []
    for p in positions:
        clusters.append([p])
        while len(clusters) > 1:
            prev = clusters[-2]
            prev_end = cluster_start(prev) + (len(prev) - 1) * min_gap
            if cluster_start(clusters[-1]) - prev_end >= min_gap:
                break
            clusters[-2:] = [prev + clusters[-1]]

    result = []
    for cluster in clusters:
        start = cluster_start(cluster)
        result.extend(start + k * min_gap for k in range(len(cluster)))
    return result

def draw_tick_labels(fig, ax, ticks, labels, fontsize=8):
    # Tick marks stay at their true positions. Labels that would collide are
    # spread apart and connected to their tick with a thin leader line.
    px_per_pt = fig.dpi / 72
    (x0, y0), (x1, y1) = ax.transData.inverted().transform([(0, 0), (px_per_pt, px_per_pt)])
    x_per_pt, y_per_pt = x1 - x0, y1 - y0

    to_pt = lambda x: (x - x0) / x_per_pt
    min_gap = fontsize * 1.4  # height of a rotated label + small spacing
    lo, hi = (to_pt(x) for x in ax.get_xlim())
    tick_pts = [to_pt(t) for t in ticks]
    label_pts = spread_positions(tick_pts, min_gap, lo + min_gap / 2, hi - min_gap / 2)

    tick_len = plt.rcParams['xtick.major.size']
    pad = plt.rcParams['xtick.major.pad']
    moved = any(abs(lp - tp) > 0.01 for tp, lp in zip(tick_pts, label_pts))
    stub, slant = (2, 8) if moved else (0, 0)
    label_top = tick_len + 2 * stub + slant + (1.5 if moved else pad)

    for tick, label_pt, label in zip(ticks, label_pts, labels):
        label_x = x0 + label_pt * x_per_pt
        if moved:
            ax.plot(
                [tick, tick, label_x, label_x],
                [-y * y_per_pt for y in (tick_len, tick_len + stub, tick_len + stub + slant, tick_len + 2 * stub + slant)],
                color='black',
                linewidth=plt.rcParams['xtick.major.width'],
                clip_on=False
            )
        ax.text(
            label_x,
            -label_top * y_per_pt,
            label,
            ha='center',
            va='top',
            fontsize=fontsize,
            rotation=90
        )

def draw_network_diagram(main_cidr, subnet_groups, title=None, width_px=1400):
    main_net = parse_network(main_cidr)
    if not main_net:
        return
    
    # Convert pixels to inches (matplotlib uses inches, 100 DPI default)
    # Hardcode A4 Landscape dimensions
    # A4 is 297mm x 210mm
    # 297mm / 25.4 = 11.69 inches
    # 210mm / 25.4 = 8.27 inches
    width_inches = 11.69
    height_inches = 8.27

    # Parse all subnets and store with metadata
    parsed_subnets = []
    group_text_summaries = [] # Store text summary for each group

    for group_idx, group in enumerate(subnet_groups):
        # Determine display title: use title if present, else comment
        raw_title = group.get('title', '').strip()
        if raw_title:
            display_title = raw_title
        else:
            display_title = group.get('comment', f"Group {group_idx+1}")
            
        group_title = raw_title # If empty, keep it empty for diagram labels
        group_comment = group.get('comment')
        cidrs_data = group.get('subnets', [])
        show_full = group.get('show_full', True)
        group_color = group.get('color')  # Optional color specification
        
        group_subnets = []
        
        # detailed tracking for text summary
        group_min_octet = 256
        group_max_octet = -1
        group_prefix_str = ""

        # First pass to find common prefix and octet range
        temp_cidrs = []
        for item in cidrs_data:
             if isinstance(item, str): cidr = item
             elif isinstance(item, dict): cidr = item.get('cidr')
             else: continue
             temp_cidrs.append(cidr)
        
        for cidr_str in temp_cidrs:
             try:
                ip_part, prefix_part = cidr_str.split('/')
                # Find the prefix (first 2 octets)
                # Assumes all subnets in a group share at least the first 2 octets as per example implication
                if not group_prefix_str:
                    parts = ip_part.split('.')
                    if len(parts) >= 2:
                        group_prefix_str = f"{parts[0]}.{parts[1]}"
                
                # Get range of 3rd octets
                net = ipaddress.ip_network(cidr_str, strict=False)
                start_3rd = int(net.network_address.packed[2])
                end_3rd = int(net.broadcast_address.packed[2])
                
                if start_3rd < group_min_octet: group_min_octet = start_3rd
                if end_3rd > group_max_octet: group_max_octet = end_3rd

             except Exception:
                 pass

        if group_prefix_str and group_min_octet <= group_max_octet:
             if group_min_octet == group_max_octet:
                 # Static range, e.g. 192.168.76.0
                 range_str = f"{group_prefix_str}.{group_min_octet}.0"
             else:
                 # Range e.g. 192.168.0 - 20
                 range_str = f"{group_prefix_str}.{group_min_octet} - {group_max_octet}"
                 
             summary_text = f"{display_title} : {range_str}"
             group_text_summaries.append(summary_text)

        # Second pass to build render data
        for item in cidrs_data:
            # Handle both string and dict inputs
            if isinstance(item, str):
                cidr_str = item
            elif isinstance(item, dict):
                cidr_str = item.get('cidr')
            else:
                continue

            # Manual parsing to respect user input (non-aligned)
            try:
                ip_part, prefix_part = cidr_str.split('/')
                prefix_len = int(prefix_part)
                start_ip_int = int(ipaddress.IPv4Address(ip_part))
                num_hosts = 2**(32 - prefix_len)
                end_ip_int = start_ip_int + num_hosts - 1
                
                # Create a network object for display/validation (strict=False will align it, but we use custom coords)
                net = ipaddress.ip_network(cidr_str, strict=False)
                
                # Check if it fits in main network
                main_start = int(main_net.network_address)
                main_end = int(main_net.broadcast_address)
                
                # Warn if outside but don't skip (respect user input)
                if start_ip_int < main_start or end_ip_int > main_end:
                     print(f"Warning: {cidr_str} extends outside main network boundaries.")
                     # continue # Don't skip, draw it anyway

                group_subnets.append({
                    'net': net, # Keep for label
                    'cidr_str': cidr_str, # Keep original string
                    'start_int': start_ip_int,
                    'end_int': end_ip_int,
                    'title': group_title,
                    'group_idx': group_idx,
                    'comment': group_comment,
                    'color': group_color
                })
            except Exception as e:
                print(f"Error parsing {cidr_str}: {e}")
                continue
        
        # If show_full is False, consolidate all subnets into one block
        if not show_full and group_subnets:
            min_start = min(s['start_int'] for s in group_subnets)
            max_end = max(s['end_int'] for s in group_subnets)
            
            parsed_subnets.append({
                'net': None,
                'cidr_str': None,  # No IP range label when show_full is False
                'start_int': min_start,
                'end_int': max_end,
                'title': group_title,
                'group_idx': group_idx,
                'comment': group_comment,
                'color': group_color,
                'show_full': False
            })
        else:
            # Show all individual subnets
            for subnet in group_subnets:
                subnet['show_full'] = True
            parsed_subnets.extend(group_subnets)

    # Generate Colored Version
    render_plot(main_net, parsed_subnets, group_text_summaries, "subnet_map.png", title=title, style="colored", width_inches=width_inches, height_inches=height_inches)
    
    # Generate B&W Version
    render_plot(main_net, parsed_subnets, group_text_summaries, "subnet_map_bw.png", title=title, style="bw", width_inches=width_inches, height_inches=height_inches)

def render_plot(main_net, subnets_data, text_summaries, output_file, title=None, style="colored", width_inches=11.69, height_inches=8.27):
    # Setup plot
    fig, ax = plt.subplots(figsize=(width_inches, height_inches))
    
    # 0.5 cm margin settings
    # 0.5 cm in inches is approx 0.197
    margin_in = 0.2 
    
    # Calculate relative margins
    left = margin_in / width_inches
    right = 1 - (margin_in / width_inches)
    bottom = margin_in / height_inches
    top = 1 - (margin_in / height_inches)
    
    # Adjust strictly
    plt.subplots_adjust(left=left, right=right, top=top, bottom=bottom)
    
    # Define X axis limits based on main network
    start_ip_int = ip_to_int(main_net.network_address)
    end_ip_int = ip_to_int(main_net.broadcast_address)
    total_hosts = end_ip_int - start_ip_int
    
    # Add padding to center the visualization
    padding = total_hosts * 0.02
    ax.set_xlim(start_ip_int - padding, end_ip_int + padding)
    ax.set_ylim(-3, 4) # Expanded Y range to fit text below
    
    # Hide Y axis
    ax.get_yaxis().set_visible(False)
    
    # Hide spines (borders)
    for spine in ax.spines.values():
        spine.set_visible(False)
    # Show bottom spine for the axis (moved manually?? No, standard axis is fine if we place ticks right)
    
    # Move the bottom spine up a bit if needed, or just let it be at y=0 (default data coords imply 0?)
    # Just make simple line at y=0
    # Actually, let's keep the standard bottom spine but we might need to adjust tick positions.
    ax.spines['bottom'].set_visible(True)
    ax.spines['bottom'].set_position(('data', 0))
    
    # Calculate ticks based on subnet boundaries
    boundary_ips = set()
    # Always include main network start/end
    boundary_ips.add(start_ip_int)
    boundary_ips.add(end_ip_int)
    
    for item in subnets_data:
        # Use custom coordinates
        s_start = item['start_int']
        s_end = item['end_int']
        boundary_ips.add(s_start)
        boundary_ips.add(s_end + 1) # Next IP
        
    sorted_ticks = sorted(list(boundary_ips))
    
    # Filter ticks to be within the view
    visible_ticks = [t for t in sorted_ticks if start_ip_int <= t <= end_ip_int]
    
    tick_labels = [str(ipaddress.ip_address(t)) for t in visible_ticks]
    
    ax.set_xticks(visible_ticks)
    ax.set_xticklabels([])
    draw_tick_labels(fig, ax, visible_ticks, tick_labels, fontsize=8)

    # Draw Main Network (Base Line/Bar)
    main_rect = patches.Rectangle(
        (start_ip_int, 0.5), 
        total_hosts, 
        0.5, 
        linewidth=0, 
        edgecolor='none', 
        facecolor='none',
        label=str(main_net)
    )
    ax.add_patch(main_rect)

    # Draw Subnets
    subnets_data.sort(key=lambda x: x['start_int'])

    for i, item in enumerate(subnets_data):
        # Use custom coordinates
        s_start = item['start_int']
        s_end = item['end_int']
        s_width = s_end - s_start + 1

        subnet_title = item['title']
        group_idx = item['group_idx']
        comment = item['comment']
        cidr_label = item['cidr_str']
        specified_color = item.get('color')

        # Determine color based on style
        if style == "colored":
            if specified_color:
                # Use specified color (lookup by name or use hex directly)
                color = COLORS.get(specified_color, specified_color)
            else:
                # Fall back to default color cycle
                color = DEFAULT_COLORS[group_idx % len(DEFAULT_COLORS)]
            edge_color = 'black'
        else:
            color = 'white' # B&W style
            edge_color = 'black'
        
        # Draw rectangle
        rect = patches.Rectangle(
            (s_start, 0.2), # Slightly above axis
            s_width, 
            0.8, 
            linewidth=1, 
            edgecolor=edge_color, 
            facecolor=color
        )
        ax.add_patch(rect)
        
        # Label (Title + CIDR) inside the block
        # Only show CIDR if show_full is True or cidr_label exists
        if cidr_label:
            label_text = f"{subnet_title}\n{cidr_label}"
        else:
            label_text = subnet_title
        
        ax.text(
            s_start + s_width/2, 
            0.6, # Centered in rect
            label_text, 
            ha='center', 
            va='center', 
            fontsize=8, 
            rotation=90 if s_width < total_hosts * 0.08 else 0
        )
        
        # Comment above the block
        if comment:
            ax.text(
                s_start + s_width/2, 
                1.1, 
                comment, 
                ha='center', 
                va='bottom', 
                fontsize=8, 
                fontstyle='italic',
                rotation=90 if s_width < total_hosts * 0.08 else 0
            )

    # Title - Manually placed close to diagram
    final_title = title if title else str(main_net)
    # Place title at y=3, diagram max is around 1.5-2 with comments
    ax.text(
        (start_ip_int + end_ip_int) / 2,
        3.5,
        final_title,
        ha='center',
        va='bottom',
        fontsize=24,
        fontweight='bold'
    )

    # Text Breakdown - Below Diagram
    # Render in columns of 5, starting from left.
    
    text_y_start = -1.5
    line_height = 0.3
    rows_per_col = 5
    
    # Calculate column width (approx 25% of total width for now to fit ~4 columns)
    # Adjust based on expected length of text?
    col_width = total_hosts * 0.25
    
    for i, line in enumerate(text_summaries):
        col = i // rows_per_col
        row = i % rows_per_col
        
        x_pos = start_ip_int + (col * col_width)
        y_pos = text_y_start - (row * line_height)
        
        ax.text(
            x_pos,
            y_pos,
            line,
            ha='left',
            va='top',
            fontsize=10,
            family='monospace'
        )

    # Save
    print(f"Saving visualization to {output_file}...")
    plt.savefig(output_file, dpi=300)
    plt.close(fig)
    print("Done.")

def load_data_module(file_path):
    try:
        module_name = os.path.splitext(os.path.basename(file_path))[0]
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        else:
            print(f"Error: Could not load module from {file_path}")
            return None
    except Exception as e:
        print(f"Error loading module {file_path}: {e}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate subnet visualization.")
    parser.add_argument("-in", "--input", help="Path to the python data file (default: data.py)", default=None)
    
    args = parser.parse_args()
    
    data_module = None
    
    if args.input:
        if os.path.exists(args.input):
            print(f"Loading data from {args.input}...")
            data_module = load_data_module(args.input)
        else:
            print(f"Error: Input file {args.input} not found.")
            sys.exit(1)
    else:
        # Default behavior: try to import data.py from current directory
        # We use dynamic import here too to be consistent, or just try 'import data'
        # To ensure we look in the current directory even if not in path correctly (though usually is)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        default_data_path = os.path.join(current_dir, "data.py")
        
        if os.path.exists(default_data_path):
            print(f"Loading default data from {default_data_path}...")
            data_module = load_data_module(default_data_path)
        else:
             print("Error: data.py not found in current directory and no input file provided.")
             sys.exit(1)

    if data_module:
        try:
            main_subnet = data_module.main_subnet
            subnet_groups = data_module.subnet_groups
            # map_title is optional? The original import expected it. Let's try to get it, default None
            map_title = getattr(data_module, 'map_title', None)
            
            draw_network_diagram(main_subnet, subnet_groups, title=map_title)
        except AttributeError as e:
            print(f"Error: Data file missing required variables: {e}")
            print("Expected 'main_subnet' and 'subnet_groups'.")

