import os

file_path = "frontend/src/pages/AdminDashboard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.read().split('\n')

# Error 1: Lines 552/553 (0-indexed)
# Swap them
if "</div>" in lines[552] and "</AdminGlassBlock>" in lines[553]:
    lines[552] = "              </AdminGlassBlock>"
    lines[553] = "            </div>"

# Error 2: Lines 744/745
if "</div>" in lines[744] and "</AdminGlassBlock>" in lines[745]:
    lines[744] = "              </AdminGlassBlock>"
    lines[745] = "            </div>"

# Error 3: Lines 850/851
if "</AdminGlassBlock>" in lines[850] and "</div>" in lines[851]:
    lines[850] = "              </AdminGlassBlock>"
    lines[851] = "            </div>"
elif "</div>" in lines[850] and "</AdminGlassBlock>" in lines[851]:
    lines[850] = "              </AdminGlassBlock>"
    lines[851] = "            </div>"

# Another check for Error 3 based on Vite logs:
# The logs say Line 851 expected </AdminGlassBlock>.
# Let's see what is on lines 848-854:
# 849:                 </div>
# 850:               </div>
# 851:             </div>
# 852:           </div>

# Wait, the closing of API Performance block was supposed to be:
#             </AdminGlassBlock>
#           </div>
# Let's find "BOTTOM RIGHT: User Engagement" and look at the lines right before it.
for i, line in enumerate(lines):
    if "BOTTOM RIGHT: User Engagement" in line:
        # i is the comment.
        # i-1 should be </div>
        # i-2 should be </AdminGlassBlock>
        # Let's force it to be correct:
        if "</div>" in lines[i-1] and "</div>" in lines[i-2] and "</div>" in lines[i-3]:
            # This means scratch_replace.py failed to insert </AdminGlassBlock> here!
            lines[i-2] = "            </AdminGlassBlock>"
        elif "</div>" in lines[i-1] and "</div>" in lines[i-2] and "</AdminGlassBlock>" in lines[i-3]:
             pass
        elif "</div>" in lines[i-1] and "</AdminGlassBlock>" in lines[i-2]:
             pass
        
        break

# Let's also verify "BOTTOM LEFT: Active Duration Pie Chart"
for i, line in enumerate(lines):
    if "BOTTOM LEFT: Active Duration Pie Chart" in line:
        if "</div>" in lines[i-1] and "</AdminGlassBlock>" in lines[i-2] and "</div>" in lines[i-3]:
            pass
        elif "</div>" in lines[i-1] and "</div>" in lines[i-2] and "</div>" in lines[i-3]:
            lines[i-2] = "            </AdminGlassBlock>"
        break

with open(file_path, "w", encoding="utf-8") as f:
    f.write('\n'.join(lines))

print("Fixed syntax errors.")
