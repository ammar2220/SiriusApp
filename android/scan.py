import requests
from concurrent.futures import ThreadPoolExecutor

def check_ip(ip):
    try:
        r = requests.get(f"http://{ip}/api/info", timeout=0.5)
        if r.status_code == 200:
            print(f"FOUND: {ip} -> {r.text}")
    except:
        pass

ips = [f"192.168.1.{i}" for i in range(1, 255)]
with ThreadPoolExecutor(max_workers=50) as executor:
    executor.map(check_ip, ips)
