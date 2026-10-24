import socket

def scan():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.settimeout(2)
    # mDNS query for _http._tcp.local
    # This is a simplified query.
    msg = b'\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' \
          b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' \
          b'_http._tcp.local\x00'
    sock.sendto(msg, ('224.0.0.251', 5353))
    try:
        while True:
            data, addr = sock.recvfrom(1024)
            print(f"Response from {addr[0]}: {data}")
    except:
        pass

scan()
