import os
import json
import tkinter as tk
import subprocess
import customtkinter as ctk
from PIL import Image, ImageTk
import requests
import csv
import tempfile
import webbrowser
from datetime import datetime
from tkinter import filedialog

# Function to get user data from local storage
def get_user_data():
    try:
        with open("user_data.json", "r") as f:
            data = json.load(f)
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {"username": "Guest", "profession": "", "user_id": ""}

# Function to run file.py and close current window
def upload_file():
    root.destroy()
    subprocess.run(["python", "files/file.py"])

# Function to run fil1.py and close current window
def retrieve_file():
    root.destroy()
    subprocess.run(["python", "files/file1.py"])

# Function to run file2.py and close current window
def read_file():
    root.destroy()
    subprocess.run(["python", "files/read1.py"])

# Function to download logs from Supabase
def download_logs():
    try:
        # Get user ID from user data
        user_data = get_user_data()
        user_id = user_data.get("user_id", "")
        
        if not user_id:
            show_message("Error", "User ID not found. Please log in again.")
            return
            
        # Show loading message
        status_label.configure(text="Downloading logs...")
        root.update()
        
        # Set up Supabase API connection (replace with your actual Supabase details)
        supabase_url = "https://your-supabase-project-url.supabase.co"
        supabase_key = "your-supabase-api-key"
        
        # Endpoint for the storage logs
        endpoint = f"{supabase_url}/rest/v1/storage"
        
        # Parameters to filter logs by user_id
        params = {
            "select": "*",
            "user_id": f"eq.{user_id}"
        }
        
        # Headers for authentication
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
        
        # Make API request to Supabase
        response = requests.get(endpoint, params=params, headers=headers)
        
        if response.status_code == 200:
            logs_data = response.json()
            
            if not logs_data:
                show_message("Info", "No logs found for your account.")
                status_label.configure(text=status_text)
                return
                
            # Ask user where to save the CSV file
            file_path = filedialog.asksaveasfilename(
                defaultextension=".csv",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
                title="Save Logs As"
            )
            
            if not file_path:
                status_label.configure(text=status_text)
                return
                
            # Write logs to CSV
            with open(file_path, "w", newline="") as csvfile:
                if logs_data and len(logs_data) > 0:
                    # Get field names from the first log entry
                    fieldnames = logs_data[0].keys()
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    
                    writer.writeheader()
                    for log in logs_data:
                        writer.writerow(log)
                        
                    # Show success message
                    show_message("Success", f"Logs downloaded successfully to {file_path}")
                    
                    # Open the file location in file explorer
                    folder_path = os.path.dirname(os.path.abspath(file_path))
                    if os.name == 'nt':  # for Windows
                        os.startfile(folder_path)
                    elif os.name == 'posix':  # for macOS and Linux
                        subprocess.call(["open", folder_path])
                else:
                    show_message("Info", "No logs found for your account.")
        else:
            show_message("Error", f"Failed to download logs. Status code: {response.status_code}")
            
    except Exception as e:
        show_message("Error", f"An error occurred: {str(e)}")
    finally:
        status_label.configure(text=status_text)

# Function to show message dialog
def show_message(title, message):
    msg_window = ctk.CTkToplevel(root)
    msg_window.title(title)
    msg_window.geometry("400x200")
    msg_window.resizable(False, False)
    msg_window.configure(fg_color=bg_color)
    
    # Center the message window relative to the main window
    msg_window.geometry(f"+{root.winfo_x() + 150}+{root.winfo_y() + 150}")
    
    # Add content to the message window
    title_label = ctk.CTkLabel(
        msg_window,
        text=title,
        font=ctk.CTkFont(family="Arial", size=24, weight="bold"),
        text_color=highlight_color
    )
    title_label.pack(pady=20)
    
    msg_label = ctk.CTkLabel(
        msg_window,
        text=message,
        font=ctk.CTkFont(family="Arial", size=14),
        text_color=text_color
    )
    msg_label.pack(pady=20)
    
    close_btn = ctk.CTkButton(
        msg_window,
        text="Close",
        command=msg_window.destroy,
        width=120,
        height=40,
        corner_radius=10,
        fg_color=button_color,
        hover_color=button_hover_color,
        text_color=text_color,
        font=ctk.CTkFont(family="Arial", size=12, weight="bold"),
        border_width=1,
        border_color=highlight_color
    )
    close_btn.pack(pady=10)

# Set the appearance mode and theme
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# Initialize main window
root = ctk.CTk()
root.title("Secure File Manager")
root.geometry("700x580")  # Matched dimensions with login screen
root.resizable(False, False)

# Define consistent color scheme (matching login system)
bg_color = "#050b18"
header_color = "#0a1f3d"
button_color = "#0a2448"
button_hover_color = "#0c2d5a"
text_color = "#ffffff"
highlight_color = "#00c2ff"
success_color = "#00e5ff"

root.configure(fg_color=bg_color)

# Get user data
user_data = get_user_data()
user_profession = user_data.get("profession", "")

# Create header frame
header_frame = ctk.CTkFrame(root, corner_radius=0, fg_color=header_color, height=60)
header_frame.pack(fill="x")

# Add file.png icon button in header (replacing settings button)
try:
    # Try to load the icon image
    icon_image = Image.open("file.png")
    # Resize image to 32x32 pixels
    icon_image = icon_image.resize((32, 32), Image.LANCZOS)
    icon_photo = ImageTk.PhotoImage(icon_image)
    
    # Create button with image
    log_button = ctk.CTkButton(
        header_frame,
        text="",
        image=icon_photo,
        command=download_logs,
        width=40,
        height=40,
        corner_radius=10,
        fg_color="transparent",
        hover_color=button_hover_color,
    )
except Exception as e:
    # Fallback if image loading fails
    log_button = ctk.CTkButton(
        header_frame,
        text="📄",
        command=download_logs,
        width=40,
        height=40,
        corner_radius=10,
        fg_color="transparent",
        hover_color=button_hover_color,
        text_color=highlight_color,
        font=ctk.CTkFont(family="Arial", size=16)
    )

log_button.place(relx=0.05, rely=0.5, anchor="center")

# Header label in center
header_label = ctk.CTkLabel(
    header_frame,
    text="📂 Secure File Manager",
    font=ctk.CTkFont(family="Arial", size=18, weight="bold"),
    text_color=highlight_color
)
header_label.place(relx=0.5, rely=0.5, anchor="center")

# Profession label in top-right corner with improved styling to match other labels
profession_label = ctk.CTkLabel(
    header_frame,
    text=f"User: {user_profession}",
    font=ctk.CTkFont(family="Arial", size=12, weight="bold"),  # Added bold weight to match style
    text_color=highlight_color  # Changed to highlight_color to match other styled text
)
profession_label.place(relx=0.9, rely=0.5, anchor="center")

# Main frame with content
main_frame = ctk.CTkFrame(
    root,
    corner_radius=20,
    fg_color=header_color,
    border_width=2,
    border_color=highlight_color,
    width=500,
    height=440
)
main_frame.place(relx=0.5, rely=0.5, anchor="center")

# Icon
icon_label = ctk.CTkLabel(
    main_frame,
    text="📂",
    font=ctk.CTkFont(size=50),
    text_color=highlight_color
)
icon_label.place(relx=0.5, rely=0.15, anchor="center")

# Title label
title_label = ctk.CTkLabel(
    main_frame,
    text="Choose an Option",
    font=ctk.CTkFont(family="Arial", size=24, weight="bold"),
    text_color=highlight_color
)
title_label.place(relx=0.5, rely=0.25, anchor="center")

# Create styled button function
def create_styled_button(parent, text, command, enabled=True, width=240):
    button = ctk.CTkButton(
        parent,
        text=text,
        command=command if enabled else None,
        width=width,
        height=40,
        corner_radius=10,
        fg_color=button_color if enabled else "#1a2535",
        hover_color=button_hover_color if enabled else "#1a2535",
        text_color=text_color if enabled else "#4d5b70",
        font=ctk.CTkFont(family="Arial", size=12, weight="bold"),
        border_width=1,
        border_color=highlight_color if enabled else "#1a2535",
        state="normal" if enabled else "disabled"
    )
    return button

# Upload button - only enabled for doctors
upload_btn = create_styled_button(
    main_frame,
    "Upload File",
    upload_file,
    enabled=(user_profession.lower() == "doctor")
)
upload_btn.place(relx=0.5, rely=0.4, anchor="center")

# Retrieve button - enabled for doctors and patients
retrieve_btn = create_styled_button(
    main_frame,
    "Retrieve File",
    retrieve_file,
    enabled=(user_profession.lower() in ["doctor", "patient"])
)
retrieve_btn.place(relx=0.5, rely=0.55, anchor="center")

# Read button - enabled for all roles
read_btn = create_styled_button(
    main_frame,
    "Read File",
    read_file,
    enabled=True
)
read_btn.place(relx=0.5, rely=0.7, anchor="center")

# Status label - improved styling to match other text elements
status_text = ""
if user_profession.lower() == "doctor":
    status_text = "Doctor access: All features enabled"
elif user_profession.lower() == "patient":
    status_text = "Patient access: Retrieval and reading enabled"
elif user_profession.lower() == "chemist":
    status_text = "Chemist access: Reading only enabled"
else:
    status_text = "Waiting for action..."

status_label = ctk.CTkLabel(
    main_frame,
    text=status_text,
    font=ctk.CTkFont(family="Arial", size=12, weight="bold"),  # Increased size and made bold
    text_color=highlight_color  # Changed to highlight_color to match
)
status_label.place(relx=0.5, rely=0.85, anchor="center")

# Footer frame
footer_frame = ctk.CTkFrame(root, corner_radius=0, fg_color=header_color, height=30)
footer_frame.pack(fill="x", side="bottom")

# Footer label
footer_label = ctk.CTkLabel(
    footer_frame,
    text="© 2025 Secure File Manager",
    font=ctk.CTkFont(family="Arial", size=10, slant="italic"),
    text_color=highlight_color
)
footer_label.place(relx=0.5, rely=0.5, anchor="center")

# Store the icon_photo reference to prevent garbage collection
root.icon_photo = icon_photo if 'icon_photo' in locals() else None

root.mainloop()