import os

file_path = "frontend/src/pages/AdminDashboard.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    c = f.read()

# 1. Response Times
c = c.replace(
    "<div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>\n              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.75rem' }}>Response times",
    "<AdminGlassBlock style={{ borderRadius: '8px', padding: '1rem' }}>\n              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.75rem' }}>Response times",
    1
)

c = c.replace(
    "              <div style={{ height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #34d399 0%, #34d399 60%, #facc15 80%, #ef4444 100%)' }} />\n            </div>\n\n            {/* Endpoints List */}",
    "              <div style={{ height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #34d399 0%, #34d399 60%, #facc15 80%, #ef4444 100%)' }} />\n            </AdminGlassBlock>\n\n            {/* Endpoints List */}",
    1
)

# 2. Endpoints List
c = c.replace(
    "{/* Endpoints List */}\n            <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>",
    "{/* Endpoints List */}\n            <AdminGlassBlock style={{ borderRadius: '8px', padding: '1rem' }}>",
    1
)

c = c.replace(
    "                })}\n              </div>\n            </div>\n          </div>\n\n          {/* ── BOTTOM LEFT:",
    "                })}\n              </div>\n            </AdminGlassBlock>\n          </div>\n\n          {/* ── BOTTOM LEFT:",
    1
)

# 3. API Performance Block
c = c.replace(
    "{/* API Performance Block — stretches to fill row height */}\n            <div style={{ flex: 1, background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>",
    "{/* API Performance Block — stretches to fill row height */}\n            <AdminGlassBlock style={{ flex: 1, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>",
    1
)

c = c.replace(
    "                    </BarChart>\n                  </ResponsiveContainer>\n                </div>\n              </div>\n            </div>\n          </div>\n\n          {/* ── BOTTOM RIGHT:",
    "                    </BarChart>\n                  </ResponsiveContainer>\n                </div>\n              </div>\n            </AdminGlassBlock>\n          </div>\n\n          {/* ── BOTTOM RIGHT:",
    1
)

# 4. User Engagement
c = c.replace(
    "{/* User Activity Section (Grouped Bar Chart) */}\n              <div style={{ \n                flex: 1,\n                background: '#161616', \n                border: '1px solid #2d2d2d', \n                borderRadius: '12px', \n                padding: '1.5rem',\n                display: 'flex',\n                flexDirection: 'column',\n                transition: 'all 0.3s ease'\n              }}>",
    "{/* User Activity Section (Grouped Bar Chart) */}\n              <AdminGlassBlock style={{ \n                flex: 1,\n                borderRadius: '12px', \n                padding: '1.5rem',\n                display: 'flex',\n                flexDirection: 'column',\n                transition: 'all 0.3s ease'\n              }}>",
    1
)

c = c.replace(
    "                      </BarChart>\n                    </ResponsiveContainer>\n                  </div>\n                </div>\n              </div>\n            </div>\n            \n            {/* Supabase-style Log Explorer */}",
    "                      </BarChart>\n                    </ResponsiveContainer>\n                  </div>\n                </div>\n              </AdminGlassBlock>\n            </div>\n            \n            {/* Supabase-style Log Explorer */}",
    1
)


with open(file_path, "w", encoding="utf-8") as f:
    f.write(c)

print("Replacement complete.")
