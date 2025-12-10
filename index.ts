import * as fs from 'fs'
import * as cors from '@fastify/cors'
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface RunRequestBody {
    code: string
    language: string
}

async function main() {
    const server = Fastify({ logger: true })
    await server.register(cors.default, { origin: '*' })

    server.get('/ping', async () => 'pong\n')

    server.post(
        '/run',
        async (request: FastifyRequest<{ Body: RunRequestBody }>, reply: FastifyReply) => {
            const { code, language } = request.body

            const testCases = [
                { args: [5, 7], expected: 12 },
                { args: [-5, -3], expected: -8 }
            ]

            if (language === 'python') {
                const testRunner = `
${code}

def run_tests():
    tests = ${JSON.stringify(testCases)}
    passed = 0

    for t in tests:
        try:
            result = add(*t["args"])
            if result == t["expected"]:
                print(f"✅ {t['args']} -> {result}")
                passed += 1
            else:
                print(f"❌ {t['args']} -> {result} (expected {t['expected']})")
        except Exception as e:
            print(f"⚠️ error for {t['args']}: {str(e)}")

    print(f"passed {passed}/{len(tests)} tests")

run_tests()
`
                const filePath = '/tmp/run.py'
                fs.writeFileSync(filePath, testRunner)

                try {
                    const { stdout } = await execAsync(
                        'docker run --rm -v /tmp:/code python:3.12 python /code/run.py'
                    )
                    return { success: true, output: stdout }
                } catch (err: any) {
                    return { success: false, error: err.message }
                }
            }

            if (language === 'csharp') {
                const testRunner = `
using System;
using System.Collections.Generic;

public class Program
{
${code}

    public static void RunTests()
    {
        var tests = new List<(int a, int b, int expected)>
        {
            (5, 7, 12),
            (-5, -3, -8)
        };

        int passed = 0;

        foreach (var t in tests)
        {
            try
            {
                int result = add(t.a, t.b);

                if (result == t.expected)
                {
                    Console.WriteLine($"✅ ({t.a}, {t.b}) -> {result}");
                    passed++;
                }
                else
                {
                    Console.WriteLine($"❌ ({t.a}, {t.b}) -> {result} (expected {t.expected})");
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"⚠️ error for ({t.a}, {t.b}): {e.Message}");
            }
        }

        Console.WriteLine($"passed {passed}/{tests.Count} tests");
    }

    public static void Main()
    {
        RunTests();
    }
}
`
                const filePath = '/tmp/Program.cs'
                fs.writeFileSync(filePath, testRunner)

                try {
                    const { stdout } = await execAsync(
                        'docker run --rm -v /tmp:/code mcr.microsoft.com/dotnet/sdk:8.0 ' +
                        'bash -c "rm -rf /code/app && ' +
                        'dotnet new console -n app -o /code/app -f net8.0 --no-restore >/dev/null && ' +
                        'mv /code/Program.cs /code/app/Program.cs && ' +
                        'dotnet run --project /code/app"'
                    )
                    return { success: true, output: stdout }
                } catch (err: any) {
                    return { success: false, error: err.message }
                }
            }

            return { success: false, error: 'unsupported language' }
        }
    )

    server.get('/', async (_req, reply) => {
        return reply.type('text/html').send(`
<!doctype html>
<html lang="en-GB">
<head><title>code runner</title></head>
<body>
<h1>run code</h1>
<select id="language" onchange="setTemplate()">
<option value="python">python</option>
<option value="csharp">c#</option>
</select>
<br/><br/>
<textarea id="code" rows="15" cols="80"></textarea>
<br/><br/>
<button onclick="runCode()">run</button>
<pre id="output"></pre>
<script>
async function runCode() {
    const code = document.getElementById('code').value
    const language = document.getElementById('language').value

    const res = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
    })

    const data = await res.json()
    document.getElementById('output').textContent =
        data.success ? data.output : data.error
}

function setTemplate() {
    const lang = document.getElementById('language').value
    const textarea = document.getElementById('code')

    if (lang === 'python') {
        textarea.value = \`def add(a, b):
    return None\`
    }

    if (lang === 'csharp') {
        textarea.value = \`public static int add(int a, int b)
{
    return 0;
}\`
    }
}

window.onload = setTemplate
</script>
</body>
</html>
        `)
    })

    await server.listen({ port: 8080 })
    console.log('Server running on http://localhost:8080')
}

main()
