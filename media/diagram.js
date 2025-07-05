// diagram.js - Enhanced ER Diagram functionality using D3.js

/**
 * D3-based ER Diagram Generator
 * Provides better performance, customization, and interactivity than Mermaid
 */
class D3ERDiagram {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = d3.select(`#${containerId}`);
    this.options = {
      width: options.width || 1400, // Increased default width for better spacing
      height: options.height || 900, // Increased default height
      nodeWidth: options.nodeWidth || 240, // Increased node width
      nodeHeight: options.nodeHeight || 50, // Increased node height
      padding: options.padding || 30, // Increased padding
      fontSize: options.fontSize || 13, // Increased font size
      ...options,
    };

    this.svg = null;
    this.simulation = null;
    this.zoom = null;
    this.data = null;

    this.init();
  }

  init() {
    // Clear container
    this.container.html("");

    // Force container to be visible and get dimensions
    const containerNode = this.container.node();

    // Use a small delay to ensure container is fully rendered
    setTimeout(() => {
      // Get container dimensions
      const containerRect = containerNode.getBoundingClientRect();
      let containerWidth = containerRect.width;
      let containerHeight = containerRect.height;

      // If container height is 0 or too small, use parent dimensions
      if (containerHeight < 100) {
        const parent = containerNode.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          containerHeight = parentRect.height;
        }
      }

      // Fallback to minimum reasonable dimensions
      containerWidth = containerWidth || this.options.width;
      containerHeight = containerHeight || this.options.height;

      // Ensure minimum dimensions
      containerWidth = Math.max(containerWidth, 800);
      containerHeight = Math.max(containerHeight, 600);

      console.log("D3 Diagram init - Container dimensions:", {
        width: containerWidth,
        height: containerHeight,
        rect: containerRect,
      });

      // Update options with actual container dimensions
      this.options.width = containerWidth;
      this.options.height = containerHeight;

      // Create SVG that fills the container
      this.svg = this.container
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
        .style("background-color", "var(--vscode-editor-background)")
        .style("min-height", "100%")
        .style("display", "block");

      console.log(
        "D3 Diagram SVG created with viewBox:",
        `0 0 ${containerWidth} ${containerHeight}`
      );

      // Add defs for markers and patterns
      this.addDefs();

      // Create zoom behavior
      this.zoom = d3
        .zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", (event) => {
          this.svg.select(".main-group").attr("transform", event.transform);
        });

      this.svg.call(this.zoom);

      // Main group for all elements
      this.mainGroup = this.svg.append("g").attr("class", "main-group");

      // Groups for different elements
      this.linksGroup = this.mainGroup.append("g").attr("class", "links");
      this.nodesGroup = this.mainGroup.append("g").attr("class", "nodes");
      this.labelsGroup = this.mainGroup.append("g").attr("class", "labels");

      // If we have data, render it now
      if (this.data) {
        console.log("Rendering data after SVG initialization...");
        this.render(this.data);
      }

      console.log("D3 Diagram initialization complete");
    }, 100);
  }

  addDefs() {
    const defs = this.svg.append("defs");

    // Arrow markers for relationships with better visibility
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9)
      .attr("refY", 0)
      .attr("markerWidth", 8) // Larger arrow
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "var(--vscode-charts-blue)")
      .attr("stroke", "var(--vscode-charts-blue)")
      .attr("stroke-width", 1);

    // Drop shadow filter
    const filter = defs
      .append("filter")
      .attr("id", "drop-shadow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    filter
      .append("feDropShadow")
      .attr("dx", 2)
      .attr("dy", 2)
      .attr("stdDeviation", 3)
      .attr("flood-color", "rgba(0,0,0,0.3)");
  }

  render(data) {
    this.data = data;

    // If SVG is not initialized yet, wait for it
    if (!this.svg) {
      console.log("SVG not ready, waiting for initialization...");
      return;
    }

    // Prepare nodes and links
    const nodes = this.prepareNodes(data.tables);
    const links = this.prepareLinks(data.relationships, nodes);

    // Create force simulation with improved parameters for better layout
    this.simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => {
            // Vary distance based on table importance
            const sourceImportance = d.source.importance || 0;
            const targetImportance = d.target.importance || 0;
            const avgImportance = (sourceImportance + targetImportance) / 2;
            return Math.max(200, 300 - avgImportance * 20); // Closer for important tables
          })
          .strength(0.3) // Reduced strength for more flexibility
      )
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength((d) => {
            // Stronger repulsion for tables with more connections
            const importance = d.importance || 0;
            return Math.min(-1500, -2000 - importance * 200);
          })
          .distanceMin(100) // Minimum distance between nodes
          .distanceMax(800) // Maximum distance for efficiency
      )
      .force(
        "center",
        d3
          .forceCenter(this.options.width / 2, this.options.height / 2)
          .strength(0.05) // Gentle centering
      )
      .force(
        "collision",
        d3
          .forceCollide()
          .radius((d) => Math.max(d.width, d.height) / 2 + 50) // Increased collision radius
          .strength(0.9) // Strong collision avoidance
          .iterations(3) // Multiple iterations for better collision resolution
      )
      .force("x", d3.forceX(this.options.width / 2).strength(0.02)) // Very gentle X centering
      .force("y", d3.forceY(this.options.height / 2).strength(0.02)) // Very gentle Y centering
      .alpha(1) // Start with higher energy
      .alphaDecay(0.015) // Slower cooling for better settling
      .velocityDecay(0.4) // Increased friction for stability
      .alphaMin(0.001); // Lower minimum alpha for better settling

    // Render links
    this.renderLinks(links);

    // Render nodes
    this.renderNodes(nodes);

    // Start simulation with longer settling time for better layout
    this.simulation.on("tick", () => {
      this.updatePositions();
    });

    // Auto-fit to viewport after simulation settles with better timing
    setTimeout(() => {
      this.fitToViewport();
    }, 3000); // Increased wait time for better settling with complex layouts
  }

  prepareNodes(tables) {
    // Calculate importance score for each table based on relationships
    const tableImportance = new Map();
    tables.forEach((table) => {
      tableImportance.set(table.name, 0);
    });

    // Count relationships to determine central tables
    if (this.data && this.data.relationships) {
      this.data.relationships.forEach((rel) => {
        tableImportance.set(
          rel.table,
          (tableImportance.get(rel.table) || 0) + rel.foreignKeys.length
        );
        rel.foreignKeys.forEach((fk) => {
          tableImportance.set(
            fk.referencedTable,
            (tableImportance.get(fk.referencedTable) || 0) + 1
          );
        });
      });
    }

    // Sort tables by importance (most connected first)
    const sortedTables = [...tables].sort(
      (a, b) =>
        (tableImportance.get(b.name) || 0) - (tableImportance.get(a.name) || 0)
    );

    // Use circular/radial layout for better distribution
    const centerX = this.options.width / 2;
    const centerY = this.options.height / 2;
    const maxRadius = Math.min(this.options.width, this.options.height) / 3;

    return sortedTables.map((table, index) => {
      let x, y;

      if (index === 0) {
        // Most important table goes in center
        x = centerX;
        y = centerY;
      } else {
        // Arrange others in concentric circles
        const layer = Math.floor((index - 1) / 8) + 1;
        const posInLayer = (index - 1) % 8;
        const radius = Math.min(maxRadius * layer * 0.8, maxRadius * 2);
        const angle = (posInLayer * 2 * Math.PI) / 8;

        x = centerX + radius * Math.cos(angle);
        y = centerY + radius * Math.sin(angle);
      }

      // Add some controlled randomness to avoid perfect alignment
      const jitter = 40;
      x += (Math.random() - 0.5) * jitter;
      y += (Math.random() - 0.5) * jitter;

      return {
        id: table.name,
        name: table.name,
        columns: table.columns,
        importance: tableImportance.get(table.name) || 0,
        x: x,
        y: y,
        width: Math.max(this.options.nodeWidth, table.name.length * 8 + 40), // Dynamic width based on table name
        height: Math.max(
          this.options.nodeHeight,
          (table.columns.length + 1) * 22 + 30 // Increased spacing for better readability
        ),
      };
    });
  }

  prepareLinks(relationships, nodes) {
    const links = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    relationships.forEach((rel) => {
      rel.foreignKeys.forEach((fk) => {
        const source = nodeMap.get(rel.table);
        const target = nodeMap.get(fk.referencedTable);

        if (source && target) {
          links.push({
            source: source.id,
            target: target.id,
            label: `${fk.column} → ${fk.referencedColumn}`,
            type: "foreign-key",
          });
        }
      });
    });

    return links;
  }

  renderNodes(nodes) {
    const nodeGroups = this.nodesGroup
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(this.getDragBehavior());

    // Add node backgrounds with better styling and importance indicators
    nodeGroups
      .append("rect")
      .attr("class", "node-bg")
      .attr("width", (d) => d.width)
      .attr("height", (d) => d.height)
      .attr("rx", 12)
      .attr("ry", 12)
      .style("fill", "var(--vscode-editor-background)")
      .style("stroke", (d) => {
        // Color-code based on importance
        if (d.importance > 5) {
          return "var(--vscode-charts-red)";
        }
        if (d.importance > 2) {
          return "var(--vscode-charts-orange)";
        }
        return "var(--vscode-focusBorder)";
      })
      .style("stroke-width", (d) => (d.importance > 3 ? 3 : 2)) // Thicker border for important tables
      .style("filter", "url(#drop-shadow)")
      .style("opacity", 0.95);

    // Add table headers with better styling
    nodeGroups
      .append("rect")
      .attr("class", "node-header")
      .attr("width", (d) => d.width)
      .attr("height", 35) // Increased header height
      .attr("rx", 12)
      .attr("ry", 12)
      .style("fill", "var(--vscode-button-background)")
      .style("stroke", "var(--vscode-focusBorder)")
      .style("stroke-width", 2);

    // Add table header fix (remove bottom border radius)
    nodeGroups
      .append("rect")
      .attr("class", "node-header-fix")
      .attr("width", (d) => d.width)
      .attr("height", 18) // Adjusted for new header height
      .attr("y", 17)
      .style("fill", "var(--vscode-button-background)");

    // Add table names with better typography
    nodeGroups
      .append("text")
      .attr("class", "node-title")
      .attr("x", (d) => d.width / 2)
      .attr("y", 24) // Adjusted for new header height
      .attr("text-anchor", "middle")
      .style("fill", "var(--vscode-button-foreground)")
      .style("font-weight", "bold")
      .style("font-size", "15px") // Slightly larger font
      .style("font-family", "var(--vscode-font-family)")
      .text((d) => d.name);

    // Add columns with improved spacing and styling
    nodeGroups.each(function (d) {
      const node = d3.select(this);

      d.columns.forEach((column, i) => {
        const yPos = 50 + i * 22; // Increased spacing between columns

        // Column background (alternating) with better styling
        node
          .append("rect")
          .attr("class", "column-bg")
          .attr("x", 4) // Increased margin
          .attr("y", yPos - 13)
          .attr("width", d.width - 8) // Increased margin
          .attr("height", 20) // Increased height
          .attr("rx", 2) // Rounded corners
          .style(
            "fill",
            i % 2 === 0
              ? "var(--vscode-list-evenBackground)"
              : "var(--vscode-list-oddBackground)"
          )
          .style("opacity", 0.3); // Reduced opacity for better readability

        // Column name with better styling
        node
          .append("text")
          .attr("class", "column-name")
          .attr("x", 12) // Increased padding
          .attr("y", yPos)
          .style("fill", "var(--vscode-foreground)")
          .style("font-size", "13px") // Slightly larger font
          .style("font-family", "var(--vscode-font-family)")
          .style("font-weight", column.primaryKey ? "bold" : "normal")
          .text(column.name);

        // Column type with better positioning
        node
          .append("text")
          .attr("class", "column-type")
          .attr("x", d.width - 12) // Increased padding
          .attr("y", yPos)
          .attr("text-anchor", "end")
          .style("fill", "var(--vscode-descriptionForeground)")
          .style("font-size", "11px") // Slightly larger font
          .style("font-family", "var(--vscode-font-family)")
          .text(column.type);

        // Primary key indicator with better styling
        if (column.primaryKey) {
          node
            .append("circle")
            .attr("class", "pk-indicator")
            .attr("cx", d.width - 30) // Better positioning
            .attr("cy", yPos - 3)
            .attr("r", 4) // Slightly larger
            .style("fill", "var(--vscode-charts-yellow)")
            .style("stroke", "var(--vscode-foreground)")
            .style("stroke-width", 1);
        }
      });
    });

    // Add enhanced hover effects with better visual feedback
    nodeGroups
      .on("mouseenter", function (event, d) {
        const node = d3.select(this);

        // Highlight the node with importance-based styling
        node
          .select(".node-bg")
          .style("stroke-width", 4)
          .style(
            "stroke",
            d.importance > 2
              ? "var(--vscode-charts-red)"
              : "var(--vscode-charts-blue)"
          )
          .style("filter", "url(#drop-shadow) brightness(1.2)")
          .style("opacity", 1);

        // Fade non-connected elements
        d3.selectAll(".link").style("opacity", 0.15);

        d3.selectAll(".node").style("opacity", 0.3);

        // Highlight this node
        node.style("opacity", 1);

        // Highlight connected links and nodes
        d3.selectAll(".link")
          .filter((link) => link.source.id === d.id || link.target.id === d.id)
          .style("opacity", 1)
          .select(".link-line")
          .style("stroke-width", 3)
          .style("stroke", "var(--vscode-charts-orange)");

        // Highlight connected nodes
        d3.selectAll(".link")
          .filter((link) => link.source.id === d.id || link.target.id === d.id)
          .each(function (link) {
            const connectedNodeId =
              link.source.id === d.id ? link.target.id : link.source.id;
            d3.selectAll(".node")
              .filter((node) => node.id === connectedNodeId)
              .style("opacity", 1)
              .select(".node-bg")
              .style("stroke-width", 3)
              .style("stroke", "var(--vscode-charts-orange)");
          });

        // Enhanced tooltip with more information
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "diagram-tooltip")
          .style("position", "absolute")
          .style("background", "var(--vscode-editor-background)")
          .style("border", "2px solid var(--vscode-focusBorder)")
          .style("border-radius", "8px")
          .style("padding", "12px")
          .style("font-size", "12px")
          .style("z-index", "1000")
          .style("max-width", "300px")
          .style("opacity", 0);

        const primaryKeys = d.columns.filter((c) => c.primaryKey);
        const foreignKeys = d.columns.filter(
          (c) => c.name.includes("_id") || c.name.includes("Id")
        );

        tooltip.html(`
          <div style="font-weight: bold; font-size: 14px; color: var(--vscode-charts-blue); margin-bottom: 8px;">
            ${d.name}
          </div>
          <div style="margin-bottom: 4px;">📊 ${
            d.columns.length
          } columns total</div>
          <div style="margin-bottom: 4px;">🔑 ${
            primaryKeys.length
          } primary keys</div>
          <div style="margin-bottom: 4px;">🔗 ${
            d.importance || 0
          } relationships</div>
          ${
            primaryKeys.length > 0
              ? `<div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">
            Primary: ${primaryKeys.map((pk) => pk.name).join(", ")}
          </div>`
              : ""
          }
        `);

        tooltip.transition().duration(200).style("opacity", 1);

        // Position tooltip
        tooltip
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseleave", function (event, d) {
        const node = d3.select(this);

        // Reset all styling
        d3.selectAll(".node")
          .style("opacity", 1)
          .select(".node-bg")
          .style("stroke-width", 2)
          .style("stroke", "var(--vscode-focusBorder)")
          .style("filter", "url(#drop-shadow)")
          .style("opacity", 0.95);

        d3.selectAll(".link")
          .style("opacity", 0.7)
          .select(".link-line")
          .style("stroke-width", 2)
          .style("stroke", "var(--vscode-charts-blue)");

        // Remove tooltip
        d3.selectAll(".diagram-tooltip").remove();
      });
  }

  renderLinks(links) {
    const linkGroups = this.linksGroup
      .selectAll(".link")
      .data(links)
      .enter()
      .append("g")
      .attr("class", "link");

    // Add link lines with curved paths for better visual separation
    linkGroups
      .append("path")
      .attr("class", "link-line")
      .style("stroke", "var(--vscode-charts-blue)")
      .style("stroke-width", 2) // Slightly thinner for less clutter
      .style("opacity", 0.7)
      .style("fill", "none")
      .attr("marker-end", "url(#arrowhead)");

    // Add link labels with better positioning
    linkGroups
      .append("text")
      .attr("class", "link-label")
      .attr("text-anchor", "middle")
      .style("fill", "var(--vscode-foreground)")
      .style("font-size", "10px")
      .style("font-family", "var(--vscode-font-family)")
      .style("font-weight", "500")
      .text((d) => d.label);

    // Add link label backgrounds with better styling
    linkGroups
      .insert("rect", ".link-label")
      .attr("class", "link-label-bg")
      .style("fill", "var(--vscode-editor-background)")
      .style("stroke", "var(--vscode-charts-blue)")
      .style("stroke-width", 1)
      .style("rx", 4)
      .style("ry", 4)
      .style("opacity", 0.9);

    // Set label background dimensions
    linkGroups.each(function (d) {
      const label = d3.select(this).select(".link-label");
      const bbox = label.node().getBBox();
      d3.select(this)
        .select(".link-label-bg")
        .attr("x", bbox.x - 3)
        .attr("y", bbox.y - 1)
        .attr("width", bbox.width + 6)
        .attr("height", bbox.height + 2);
    });
  }

  updatePositions() {
    // Update node positions
    this.nodesGroup
      .selectAll(".node")
      .attr(
        "transform",
        (d) => `translate(${d.x - d.width / 2}, ${d.y - d.height / 2})`
      );

    // Update link positions with curved paths
    this.linksGroup.selectAll(".link").each(function (d) {
      const link = d3.select(this);
      const x1 = d.source.x;
      const y1 = d.source.y;
      const x2 = d.target.x;
      const y2 = d.target.y;

      // Calculate control points for curved path
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dr = Math.sqrt(dx * dx + dy * dy);

      // Create curved path to reduce visual clutter
      const curvature = 0.3;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const offsetX = -dy * curvature;
      const offsetY = dx * curvature;

      const path = `M ${x1} ${y1} Q ${midX + offsetX} ${
        midY + offsetY
      } ${x2} ${y2}`;

      // Update link path
      link.select(".link-line").attr("d", path);

      // Update link label position (at curve midpoint)
      const t = 0.5;
      const labelX =
        Math.pow(1 - t, 2) * x1 +
        2 * (1 - t) * t * (midX + offsetX) +
        Math.pow(t, 2) * x2;
      const labelY =
        Math.pow(1 - t, 2) * y1 +
        2 * (1 - t) * t * (midY + offsetY) +
        Math.pow(t, 2) * y2;

      link.select(".link-label").attr("x", labelX).attr("y", labelY);

      // Update label background
      const label = link.select(".link-label");
      const bbox = label.node().getBBox();
      link
        .select(".link-label-bg")
        .attr("x", bbox.x - 3)
        .attr("y", bbox.y - 1)
        .attr("width", bbox.width + 6)
        .attr("height", bbox.height + 2);
    });
  }

  getDragBehavior() {
    return d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) {
          this.simulation.alphaTarget(0.3).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) {
          this.simulation.alphaTarget(0);
        }
        d.fx = null;
        d.fy = null;
      });
  }

  // Zoom and pan controls
  zoomIn() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.5);
  }

  zoomOut() {
    this.svg
      .transition()
      .duration(300)
      .call(this.zoom.scaleBy, 1 / 1.5);
  }

  resetZoom() {
    this.svg
      .transition()
      .duration(500)
      .call(this.zoom.transform, d3.zoomIdentity);
  }

  fitToViewport() {
    const bounds = this.mainGroup.node().getBBox();
    const parent = this.svg.node().parentElement;
    const fullWidth = parent.clientWidth;
    const fullHeight = parent.clientHeight;

    const width = bounds.width;
    const height = bounds.height;
    const midX = bounds.x + width / 2;
    const midY = bounds.y + height / 2;

    if (width === 0 || height === 0) {
      return;
    }

    // Use more generous padding for better visibility
    const scale = Math.min(fullWidth / width, fullHeight / height) * 0.75; // Reduced from 0.9 to 0.75
    const translate = [
      fullWidth / 2 - scale * midX,
      fullHeight / 2 - scale * midY,
    ];

    this.svg
      .transition()
      .duration(1000) // Slightly faster transition
      .call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }

  // Get current zoom level
  getZoomLevel() {
    return d3.zoomTransform(this.svg.node()).k;
  }

  // Export as PNG
  exportAsPNG() {
    const svgNode = this.svg.node();
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgNode);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Set canvas size
    canvas.width = this.options.width * 2;
    canvas.height = this.options.height * 2;

    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        const link = document.createElement("a");
        link.download = "er-diagram.png";
        link.href = URL.createObjectURL(blob);
        link.click();

        URL.revokeObjectURL(url);
        URL.revokeObjectURL(link.href);
      }, "image/png");
    };

    img.src = url;
  }

  // Cleanup
  destroy() {
    if (this.simulation) {
      this.simulation.stop();
    }
    this.container.html("");
  }

  // Handle window resize
  handleResize() {
    if (!this.container || !this.svg) {
      return;
    }

    const containerRect = this.container.node().getBoundingClientRect();
    const newWidth = containerRect.width;
    const newHeight = containerRect.height;

    if (newWidth > 0 && newHeight > 0) {
      this.options.width = newWidth;
      this.options.height = newHeight;

      // Update SVG viewBox
      this.svg.attr("viewBox", `0 0 ${newWidth} ${newHeight}`);

      // Update force simulation center
      if (this.simulation) {
        this.simulation
          .force(
            "center",
            d3.forceCenter(newWidth / 2, newHeight / 2).strength(0.05)
          )
          .force("x", d3.forceX(newWidth / 2).strength(0.02))
          .force("y", d3.forceY(newHeight / 2).strength(0.02))
          .alpha(0.3)
          .restart();
      }
    }
  }

  // Force SVG to fill container
  updateSVGDimensions() {
    if (!this.svg || !this.container) {
      return;
    }

    const containerNode = this.container.node();
    const containerRect = containerNode.getBoundingClientRect();
    let containerWidth = containerRect.width;
    let containerHeight = containerRect.height;

    // If container height is 0 or too small, use parent dimensions
    if (containerHeight < 100) {
      const parent = containerNode.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        containerHeight = parentRect.height;
      }
    }

    // Ensure minimum dimensions
    containerWidth = Math.max(containerWidth, 800);
    containerHeight = Math.max(containerHeight, 600);

    // Update SVG dimensions
    this.svg
      .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
      .style("width", "100%")
      .style("height", "100%");

    // Update options
    this.options.width = containerWidth;
    this.options.height = containerHeight;

    console.log("SVG dimensions updated:", {
      width: containerWidth,
      height: containerHeight,
    });
  }
}

// Debug: Check if D3 is loaded
console.log("D3 availability check:", typeof d3);
if (typeof d3 !== "undefined") {
  console.log("D3 version:", d3.version);
} else {
  console.error("D3 is not loaded!");
}

// Export for global use
window.D3ERDiagram = D3ERDiagram;
