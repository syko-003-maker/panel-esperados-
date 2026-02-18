with open('prisma/schema.prisma', encoding='utf-8') as f:
    for i,line in enumerate(f,1):
        if 100 <= i <= 180:
            print(f"{i}: {line.rstrip()}" )
