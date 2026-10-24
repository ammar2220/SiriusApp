import requests
from concurrent.futures import ThreadPoolExecutor

def check_port(ip, port):
    try:
        r = requests.get(f"http://{ip}:{port}/api/info", timeout=0.2)
        if r.status_code == 200:
            print(f"FOUND: {ip}:{port} -> {r.text}")
    except:
        pass

def scan_ip(ip):
    ports = [80, 8080, 3000, 81]
    for p in ports:
        check_port(ip, p)

ips = ["192.168.1.1", "192.168.1.2", "192.168.1.4", "192.168.1.5", "192.168.1.6", "192.168.1.7", "192.168.1.10", "192.168.1.11"]
with ThreadPoolExecutor(max_workers=20) as executor:
    executor.map(scan_ip, ips)
