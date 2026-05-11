import re

file_path = "frontend/src/pages/AdminDashboard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# We want to replace <div style={{ background: '#161616', ... }}> with <AdminGlassBlock style={{ ... }}>
# And the corresponding </div> with </AdminGlassBlock>

# Let's find all occurrences of `<div` that have `background: '#161616'`
pattern = r"<div[^>]*style=\{\{[^}]*background:\s*'#161616'[^}]*\}\}[^>]*>"

matches = list(re.finditer(pattern, content))

print(f"Found {len(matches)} blocks to replace.")

new_content = content
offset = 0

for m in matches:
    start_idx = m.start() + offset
    end_idx = m.end() + offset
    tag_str = new_content[start_idx:end_idx]
    
    # We only want to process divs that are not self-closing (though divs rarely are)
    if tag_str.endswith("/>"):
        continue

    # Find the matching closing </div>
    # We'll use a simple stack to count nested <div> tags
    stack = 1
    i = end_idx
    while i < len(new_content):
        # find next <div or </div
        next_open = new_content.find("<div", i)
        next_close = new_content.find("</div", i)
        
        if next_close == -1:
            break
            
        if next_open != -1 and next_open < next_close:
            stack += 1
            i = next_open + 4
        else:
            stack -= 1
            i = next_close + 6
            
        if stack == 0:
            close_start = next_close
            close_end = next_close + 6
            
            # Now we have the start and end of the block
            # Replace the opening tag
            # tag_str looks like: <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
            # Replace `<div` with `<AdminGlassBlock`
            new_tag_str = tag_str.replace("<div", "<AdminGlassBlock", 1)
            # Remove `background: '#161616', ` and `border: '1px solid #2d2d2d', ` from the style
            new_tag_str = re.sub(r"background:\s*'#161616',?\s*", "", new_tag_str)
            new_tag_str = re.sub(r"border:\s*'[^']+',?\s*", "", new_tag_str)
            
            # Reconstruct the string
            part1 = new_content[:start_idx]
            part2 = new_content[end_idx:close_start]
            part3 = new_content[close_end:]
            
            new_content = part1 + new_tag_str + part2 + "</AdminGlassBlock>" + part3
            
            # Update offset due to string length changes
            offset += (len(new_tag_str) - len(tag_str)) + (len("</AdminGlassBlock>") - len("</div>"))
            break

# Also, we need to inject the AdminGlassBlock component definition right after the imports
imports_end = new_content.rfind("import ")
imports_end = new_content.find("\n", imports_end) + 1

admin_glass_block_def = """
const AdminGlassBlock = ({ children, style = {}, className = "" }) => {
  const { padding, display, flexDirection, alignItems, justifyContent, gap, flex, minHeight, transition, gridColumn, gridRow, overflow, ...outerStyle } = style;
  return (
    <div className={className} style={{ position: 'relative', overflow: overflow || 'hidden', flex, minHeight, transition, gridColumn, gridRow, ...outerStyle }}>
      <GlassSurface width="100%" height="100%" borderRadius={outerStyle.borderRadius ? parseInt(outerStyle.borderRadius) : 8} blur={20} opacity={0.35} brightness={40} saturation={1.5}>
        <div style={{ padding: padding || '1rem', display, flexDirection, alignItems, justifyContent, gap, position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box' }}>
          {children}
        </div>
      </GlassSurface>
    </div>
  )
}
"""

if "const AdminGlassBlock" not in new_content:
    new_content = new_content[:imports_end] + admin_glass_block_def + new_content[imports_end:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Done. Wrote refactored code.")
