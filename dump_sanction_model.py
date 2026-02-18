with open('prisma/schema.prisma', encoding='utf-8') as f:
    lines = f.readlines()
for i in range(534, 620):
    print(f"{i+1}: {lines[i].rstrip()}")
